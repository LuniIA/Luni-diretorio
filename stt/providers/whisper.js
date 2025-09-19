// stt/providers/whisper.js - Provedor Whisper como fallback
// Implementação alternativa usando Whisper-1 da OpenAI

import OpenAI from 'openai';
import fs from 'fs';
import { debugLog } from '../../Utils/debugLog.js';

class WhisperProvider {
  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    this.model = 'whisper-1';
    this.language = process.env.STT_LANGUAGE || 'pt';
    
    debugLog('stt_whisper', { 
      model: this.model,
      language: this.language,
      configured: !!process.env.OPENAI_API_KEY
    });
  }

  /**
   * Transcreve arquivo de áudio usando Whisper-1
   */
  async transcrever(audioPath, cliente) {
    const startTime = Date.now();
    
    try {
      // Verificar se arquivo existe
      if (!fs.existsSync(audioPath)) {
        throw new Error(`Arquivo de áudio não encontrado: ${audioPath}`);
      }

      // Verificar tamanho do arquivo
      const stats = fs.statSync(audioPath);
      const fileSizeMB = stats.size / (1024 * 1024);
      
      if (fileSizeMB > 25) {
        throw new Error(`Arquivo muito grande: ${fileSizeMB.toFixed(2)}MB (máximo: 25MB)`);
      }

      debugLog('stt_whisper', {
        action: 'iniciando_transcricao_whisper',
        audioPath,
        fileSizeMB: fileSizeMB.toFixed(2),
        cliente: cliente.nome
      });

      // Criar stream do arquivo
      const audioStream = fs.createReadStream(audioPath);

      // Configurações específicas do Whisper
      const transcriptionOptions = {
        model: this.model,
        file: audioStream,
        language: this.language,
        response_format: 'text',
        temperature: 0.0,
        prompt: this.gerarPromptContexto(cliente) // Melhora acurácia
      };

      // Fazer a transcrição
      const response = await this.client.audio.transcriptions.create(transcriptionOptions);

      // Processar resposta
      let text = '';
      if (typeof response === 'string') {
        text = response;
      } else if (response.text) {
        text = response.text;
      } else {
        throw new Error('Formato de resposta inesperado do Whisper');
      }

      // Limpar e normalizar texto
      text = this.normalizarTexto(text);

      const duration = Date.now() - startTime;

      debugLog('stt_whisper', {
        action: 'transcricao_whisper_concluida',
        textLength: text.length,
        duration,
        cliente: cliente.nome
      });

      return {
        text,
        provider: 'whisper',
        model: this.model,
        duration,
        fileSizeMB
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      debugLog('stt_whisper', {
        action: 'erro_transcricao_whisper',
        error: error.message,
        duration,
        cliente: cliente.nome
      });

      throw error;
    }
  }

  /**
   * Gera prompt de contexto para melhorar acurácia
   */
  gerarPromptContexto(cliente) {
    const contexto = [];
    
    // Adicionar contexto do negócio
    if (cliente.segmento) {
      contexto.push(`Segmento: ${cliente.segmento}`);
    }
    
    if (cliente.nome) {
      contexto.push(`Empresa: ${cliente.nome}`);
    }
    
    // Adicionar termos comuns do negócio
    if (cliente.produtosServicos && Array.isArray(cliente.produtosServicos)) {
      const produtos = cliente.produtosServicos.slice(0, 3).map(p => p.nome).join(', ');
      if (produtos) {
        contexto.push(`Produtos: ${produtos}`);
      }
    }
    
    // Adicionar termos comuns em português
    contexto.push('Termos comuns: agendamento, horário, preço, valor, serviço, produto, cliente');
    
    return contexto.join('. ');
  }

  /**
   * Normaliza texto transcrito
   */
  normalizarTexto(text) {
    if (!text || typeof text !== 'string') {
      return '';
    }

    return text
      .trim()
      .replace(/\s+/g, ' ') // Múltiplos espaços em um
      .replace(/[^\w\s.,!?;:()\-]/g, '') // Remove caracteres especiais
      .replace(/\b(um|uma|o|a|de|da|do|em|na|no|para|por|com|sem)\b/g, '') // Remove artigos comuns
      .trim();
  }

  /**
   * Verifica se o provedor está configurado
   */
  verificarConfiguracao() {
    return {
      apiKey: !!process.env.OPENAI_API_KEY,
      model: this.model,
      language: this.language,
      configured: !!process.env.OPENAI_API_KEY
    };
  }

  /**
   * Obtém informações do provedor
   */
  obterInfo() {
    return {
      name: 'Whisper',
      models: ['whisper-1'],
      currentModel: this.model,
      language: this.language,
      maxFileSize: '25MB',
      supportedFormats: ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm'],
      features: ['context_prompt', 'language_detection', 'punctuation']
    };
  }
}

// Singleton
const whisperProvider = new WhisperProvider();

export default whisperProvider;

