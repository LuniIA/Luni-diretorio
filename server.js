// server.js - Servidor HTTP para integração com Twilio/WhatsApp
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { carregarCliente } from './clienteLoader.js';
import { processaMensagem } from './core/app.js';
import { detectarPeriodoDia } from './Utils/unified.js';
import storeAdapter from './config/storeAdapter.js';
import sttManager from './stt/index.js';
import { getClienteByPhone } from './config/clientMapping.js';
import { gerarApresentacao } from './Utils/apresentacaoBot.js';
import pino from 'pino';

// Twilio manager opcional (lazy import para evitar crash sem credenciais)
let twilioManager = null;
try {
  const m = await import('./config/twilio.js');
  twilioManager = m.default;
} catch (e) {
  // prossegue sem twilioManager em ambientes de teste/local
}

const app = express();
const PORT = process.env.PORT || 3000;

// Render/Proxies: confiar no header X-Forwarded-* para IP correto/rate limit
app.set('trust proxy', 1);

// Cache para evitar processamento duplicado de mensagens
const processedMessages = new Set();

// Logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty' },
  redact: {
    paths: [
      'req.headers.authorization',
      'body.Body',
      'body.From',
      'body.To',
      'body.MediaUrl0',
      'from',
      'to',
      'phoneNumber'
    ],
    remove: true
  }
});

// Middleware de segurança
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['https://webhook.twilio.com'],
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // máximo 100 requests por IP
  message: 'Muitas requisições, tente novamente mais tarde.'
});
app.use('/webhook', limiter);

// Middleware para parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Métricas detalhadas
app.get('/metrics', async (req, res) => {
  try {
    const { default: monitoringSystem } = await import('./config/monitoring.js');
    const metrics = await monitoringSystem.getMetrics();
    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', async (req, res) => {
  try {
    const redisHealth = await storeAdapter.healthCheck();
    const sttHealth = sttManager.verificarConfiguracao();
    
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      redis: redisHealth ? 'connected' : 'disconnected',
      stt: sttHealth,
      uptime: process.uptime()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

// Endpoint para testar STT
app.get('/stt/info', (req, res) => {
  try {
    const info = sttManager.obterEstatisticas();
    res.json(info);
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

// Endpoint de teste simples para webhook
app.post('/test-webhook', (req, res) => {
  try {
    logger.info('Teste de webhook recebido', { body: req.body });
    res.json({ 
      success: true, 
      message: 'Webhook funcionando!',
      body: req.body 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Backup manual (protegido por chave simples)
app.post('/backup/manual', async (req, res) => {
  try {
    const apiKey = process.env.BACKUP_API_KEY || '';
    const provided = req.headers['x-backup-key'] || req.query.key || '';
    if (!apiKey || String(provided) !== String(apiKey)) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    const { default: child_process } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const exec = promisify(child_process.exec);
    const { stdout } = await exec('node scripts/backup.js');
    res.json({ success: true, result: JSON.parse(stdout) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para gerenciar mapeamento de clientes
app.get('/clients', async (req, res) => {
  try {
    const { getMappingStats, listAvailableClients } = await import('./config/clientMapping.js');
    const stats = getMappingStats();
    const clients = listAvailableClients();
    
    res.json({
      stats,
      clients,
      message: 'Use POST /clients para adicionar mapeamentos'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Adicionar mapeamento de cliente
app.post('/clients', async (req, res) => {
  try {
    const { phoneNumber, clienteId } = req.body;
    
    if (!phoneNumber || !clienteId) {
      return res.status(400).json({ 
        error: 'phoneNumber e clienteId são obrigatórios' 
      });
    }
    
    const { addClientMapping } = await import('./config/clientMapping.js');
    const success = addClientMapping(phoneNumber, clienteId);
    
    res.json({ 
      success, 
      message: `Mapeamento adicionado: ${phoneNumber} -> ${clienteId}` 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Webhook para Twilio
app.post('/webhook', async (req, res) => {
  try {
    const { Body, From, To, MessageSid, NumMedia, MediaContentType0, MediaUrl0 } = req.body;
    
    // Validação de assinatura Twilio (opcional via env)
    if (process.env.TWILIO_VALIDATE === '1') {
      try {
        if (twilioManager && !twilioManager.validarWebhook(req)) {
          logger.warn('Assinatura Twilio inválida');
          return res.status(403).send('Invalid signature');
        }
      } catch (e) {
        logger.warn('Falha ao validar assinatura Twilio', { err: e.message });
        // prossegue para não interromper em staging
      }
    }

    logger.info('Webhook recebido', { 
      Body, From, To, MessageSid, NumMedia, MediaContentType0, MediaUrl0,
      body: req.body 
    });
    
    if (!Body && Number(NumMedia) === 0) {
      logger.warn('Webhook inválido recebido', { body: req.body });
      return res.status(400).send('Dados inválidos');
    }

    // Idempotência básica
    if (MessageSid && processedMessages.has(MessageSid)) {
      logger.warn('Mensagem duplicada ignorada', { MessageSid });
      return res.status(200).send('OK');
    }

    const clienteId = extrairClienteId(From);
    logger.info('Cliente mapeado', { from: From, clienteId });
    
    if (!clienteId) {
      logger.warn('Cliente não encontrado para número', { from: From });
      return res.status(404).send('Cliente não encontrado');
    }

    // Carregar dados do cliente para resposta personalizada
    const cliente = await carregarCliente(clienteId);
    if (!cliente) {
      logger.error('Cliente não encontrado', { clienteId });
      return res.status(404).send('Cliente não encontrado');
    }
    
    // Montar mensagem processável (texto ou áudio)
    let mensagemTexto = Body || '';
    if (!mensagemTexto && Number(NumMedia) > 0 && MediaContentType0?.startsWith('audio/')) {
      try {
        const stt = await sttManager.transcreverAudioFromUrl(MediaUrl0, MediaContentType0, cliente);
        if (stt?.sucesso && stt.text) mensagemTexto = stt.text;
      } catch (e) {
        logger.warn('Falha ao transcrever áudio', { err: e.message, MediaContentType0 });
      }
    }

    const tipoMensagem = detectarTipoMensagem(mensagemTexto || (Number(NumMedia) > 0 ? 'áudio' : 'texto'));
    const periodoDia = detectarPeriodoDia();

    const sessao = await storeAdapter.getOrInitSessao(cliente.nomeArquivo || clienteId);
    let { resposta, focoAtualizado } = await processaMensagem(
      mensagemTexto || '[midia]',
      cliente,
      sessao.primeiraInteracao,
      periodoDia,
      tipoMensagem,
      sessao.focoAtual || null,
      { sessionId: sessao.sessionId, clienteId }
    );

    await storeAdapter.updateSessionFocus(cliente.nomeArquivo || clienteId, focoAtualizado);
    
    // Log da interação
    logger.info({
      msg: 'webhook_processed',
      cliente: clienteId,
      messageSid: MessageSid,
      from: From,
      messageLength: (Body || '').length,
      isAudio: Number(NumMedia) > 0
    });

    // Retornar resposta no formato TwiML para que o Twilio envie a mensagem
    const escapeXml = (s) => String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
    // Reduz e sanitiza para WhatsApp (evitar 63005)
    const sanitizeForWhatsapp = (text) => String(text)
      .replace(/\n{3,}/g, '\n\n')
      .slice(0, 1200);
    if (process.env.TWILIO_SHORT_REPLY === '1') {
      resposta = 'Olá! Recebi sua mensagem.';
    } else {
      resposta = sanitizeForWhatsapp(resposta);
    }
    const twiml = `<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Message>${escapeXml(resposta)}</Message></Response>`;
    res.type('text/xml');
    res.send(twiml);

    if (MessageSid) processedMessages.add(MessageSid);

  } catch (error) {
    logger.error('Erro no webhook', { error: error.message, stack: error.stack });
    res.status(500).send('Erro interno do servidor');
  }
});

// Função para extrair cliente ID do número de telefone
function extrairClienteId(phoneNumber) {
  const mapping = getClienteByPhone(phoneNumber);
  
  // Log do mapeamento
  logger.info('Mapeamento de cliente', {
    phoneNumber,
    clienteId: mapping.clienteId,
    isMapped: mapping.isMapped,
    isDefault: mapping.isDefault
  });
  
  return mapping.clienteId;
}

// Função para detectar tipo de mensagem
function detectarTipoMensagem(mensagem) {
  if (mensagem.includes('http') || mensagem.includes('www.')) return 'link';
  if (mensagem.includes('📷') || mensagem.includes('foto')) return 'imagem';
  if (mensagem.includes('🎵') || mensagem.includes('áudio')) return 'audio';
  return 'texto';
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM recebido, iniciando shutdown graceful');
  server.close(() => {
    logger.info('Servidor fechado');
    process.exit(0);
  });
});

// Iniciar servidor
const server = app.listen(PORT, () => {
  logger.info(`🚀 Servidor Luni iniciado na porta ${PORT}`);
  logger.info(`📡 Webhook disponível em: http://localhost:${PORT}/webhook`);
  logger.info(`💚 Health check em: http://localhost:${PORT}/health`);
  logger.info(`🎵 STT info em: http://localhost:${PORT}/stt/info`);
});

export default app;

