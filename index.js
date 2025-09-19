// index.js v2.0 – CLI principal da Luni com logs estruturados
import readline from 'readline';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pino from 'pino';

import { carregarCliente } from './clienteLoader.js';
import { processaMensagem } from './core/app.js'; // mantém sua assinatura atual
import { detectarPeriodoDia } from './Utils/unified.js';

// ------- setup paths -------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const HIST_DIR = path.join(__dirname, 'historico');
if (!fs.existsSync(HIST_DIR)) fs.mkdirSync(HIST_DIR);

// ------- logger -------
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty' }
});

// ------- Store Adapter (Redis/Files) - Fase B -------
import storeAdapter from './config/storeAdapter.js';

// ------- CLI -------
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function detectarTipoMensagem(mensagem) {
  if (mensagem.includes('http') || mensagem.includes('www.')) return 'link';
  if (mensagem.includes('📷') || mensagem.includes('foto')) return 'imagem';
  if (mensagem.includes('🎵') || mensagem.includes('áudio')) return 'audio';
  return 'texto';
}

// ------- main loop -------
const nomeCliente = process.argv[2];
const onceIdx = process.argv.indexOf('--once');
const onceMessage = onceIdx !== -1 ? (process.argv[onceIdx + 1] || 'teste') : null;

if (!nomeCliente) {
  console.log('❌ Você precisa informar o nome do cliente. Ex: node index.js perfil1teste');
  process.exit(1);
}

const cliente = carregarCliente(nomeCliente);
if (!cliente) {
  console.log('⚠️ Cliente não encontrado.');
  process.exit(1);
}

const caminhoHistorico = path.join(HIST_DIR, `${nomeCliente}_log.txt`);
try {
  await fsPromises.appendFile(caminhoHistorico, `\n\n📂 Nova sessão iniciada em ${new Date().toLocaleString()}\n`, 'utf-8');
} catch {}

console.log(`✅ Cliente '${nomeCliente}' carregado com sucesso.`);
console.log(`🤖 Luniai iniciado para o cliente: ${cliente.nome}`);
console.log('Digite sua mensagem. Para sair, digite: sair');

// ------- modo não interativo (uma única mensagem) -------
if (onceIdx !== -1) {
  const clienteIdSlug = cliente?.nomeArquivo || nomeCliente;
  const sessao = await storeAdapter.getOrInitSessao(clienteIdSlug);
  const primeiraInteracao = sessao.primeiraInteracao;
  const periodoDia = detectarPeriodoDia();
  const tipoMensagem = detectarTipoMensagem(onceMessage);
  const focoAtual = sessao.focoAtual || null;

  try {
    const { resposta, focoAtualizado } = await processaMensagem(
      onceMessage,
      cliente,
      primeiraInteracao,
      periodoDia,
      tipoMensagem,
      focoAtual,
      { sessionId: sessao.sessionId, clienteId: clienteIdSlug }
    );
    await storeAdapter.updateSessionFocus(clienteIdSlug, focoAtualizado);
    console.log('Você:', onceMessage);
    console.log('Bot:', resposta);
  } catch (e) {
    console.error('Erro ao processar mensagem única:', e?.message || String(e));
  } finally {
    rl.close();
    process.exit(0);
  }
}

async function loop() {
  rl.question('Você: ', async (mensagem) => {
    if (mensagem.toLowerCase() === 'sair') {
      console.log('🔚 Sessão encerrada.');
      rl.close();
      return;
    }

    const clienteIdSlug = cliente?.nomeArquivo || nomeCliente;
    const sessao = await storeAdapter.getOrInitSessao(clienteIdSlug);
    const primeiraInteracao = sessao.primeiraInteracao;
    const periodoDia = detectarPeriodoDia();
    const tipoMensagem = detectarTipoMensagem(mensagem);
    const focoAtual = sessao.focoAtual || null;

    const inicio = Date.now();
    try {
      const { resposta, focoAtualizado /*, meta */ } = await processaMensagem(
        mensagem,
        cliente,
        primeiraInteracao,
        periodoDia,
        tipoMensagem,
        focoAtual,
        {
          sessionId: sessao.sessionId,
          clienteId: clienteIdSlug
          // dica: app.js pode popular meta: { tokensIn, tokensOut, costUsd, model, latencyMs }
        }
      );

      // Atualiza foco na sessão
      await storeAdapter.updateSessionFocus(clienteIdSlug, focoAtualizado);

      const logTxt =
        `\n[${new Date().toLocaleTimeString()}] (sessão: ${sessao.sessionId})\n` +
        `Você: ${mensagem}\nLuni: ${resposta}\n`;
      try { await fsPromises.appendFile(caminhoHistorico, logTxt, 'utf-8'); } catch {}

      const lat = Date.now() - inicio;
      logger.info({
        msg: 'reply',
        cliente: nomeCliente,
        sessionId: sessao.sessionId,
        tipoMensagem,
        periodoDia,
        primeiraInteracao,
        latencyMs: lat
        // tokensIn: meta?.tokensIn,
        // tokensOut: meta?.tokensOut,
        // model: meta?.model,
        // costUsd: meta?.costUsd
      });

      console.log('Bot:', resposta);
    } catch (error) {
      const errMsg = error?.message || String(error);
      logger.error({ msg: 'processaMensagem_error', cliente: nomeCliente, error: errMsg });
      const respostaErro =
        '⚠️ Estamos enfrentando uma instabilidade no momento. Por favor, tente novamente em alguns minutos! Obrigado pela compreensão. ';
      const logTxt =
        `\n[${new Date().toLocaleTimeString()}] (sessão: ${sessao.sessionId})\n` +
        `Você: ${mensagem}\nLuni: ${respostaErro}\n`;
      try { await fsPromises.appendFile(caminhoHistorico, logTxt, 'utf-8'); } catch {}
      console.log('Bot:', respostaErro);
    }

    await loop();
  });
}

loop();

// ------- graceful shutdown -------
function shutdown() {
  try {
    logger.info({ msg: 'shutdown' });
  } finally {
    rl.close();
    process.exit(0);
  }
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
