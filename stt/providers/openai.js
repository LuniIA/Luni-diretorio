// stt/providers/openai.js - Provedor OpenAI para transcrição
// Suporta Whisper-1 e GPT-4o Mini Transcribe

import OpenAI from 'openai';
import fs from 'fs';
import { debugLog } from '../../Utils/debugLog.js';

class OpenAIProvider {
  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    // Modelo preferido (pode ser configurado via env)
    this.model = process.env.OPENAI_STT_MODEL || 'whisper-1';
    this.language = process.env.STT_LANGUAGE || 'pt';
    
    debugLog('stt_openai', { 
      model: this.model,
      language: this.language,
      configured: !!process.env.OPENAI_API_KEY
    });
  }

  /**
   * Transcreve arquivo de áudio
   */
  async transcrever(audioPath, cliente) {
    const startTime = Date.now();
    
    try {
      // Verificar se arquivo existe
      if (!fs.existsSync(audioPath)) {
        throw new Error(`Arquivo de áudio não encontrado: ${audioPath}`);
      }

      // Verificar tamanho do arquivo (limite OpenAI: 25MB)
      const stats = fs.statSync(audioPath);
      const fileSizeMB = stats.size / (1024 * 1024);
      
      if (fileSizeMB > 25) {
        throw new Error(`Arquivo muito grande: ${fileSizeMB.toFixed(2)}MB (máximo: 25MB)`);
      }

      debugLog('stt_openai', {
        action: 'iniciando_transcricao',
        audioPath,
        fileSizeMB: fileSizeMB.toFixed(2),
        model: this.model,
        cliente: cliente.nome
      });

      // Criar stream do arquivo
      const audioStream = fs.createReadStream(audioPath);

      // Configurações da transcrição
      const transcriptionOptions = {
        model: this.model,
        file: audioStream,
        language: this.language,
        response_format: 'text',
        temperature: 0.0 // Mais determinístico
      };

      // Se for GPT-4o Mini Transcribe, usar configurações específicas
      if (this.model === 'gpt-4o-mini-transcribe') {
        transcriptionOptions.response_format = 'json';
        transcriptionOptions.temperature = 0.1;
      }

      // Fazer a transcrição
      const response = await this.client.audio.transcriptions.create(transcriptionOptions);

      // Processar resposta baseada no formato
      let text = '';
      if (typeof response === 'string') {
        text = response;
      } else if (response.text) {
        text = response.text;
      } else if (response.transcript) {
        text = response.transcript;
      } else {
        throw new Error('Formato de resposta inesperado da OpenAI');
      }

      // Limpar e normalizar texto
      text = this.normalizarTexto(text);

      const duration = Date.now() - startTime;

      debugLog('stt_openai', {
        action: 'transcricao_concluida',
        model: this.model,
        textLength: text.length,
        duration,
        cliente: cliente.nome
      });

      return {
        text,
        provider: 'openai',
        model: this.model,
        duration,
        fileSizeMB
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      debugLog('stt_openai', {
        action: 'erro_transcricao',
        error: error.message,
        model: this.model,
        duration,
        cliente: cliente.nome
      });

      // Se for erro de modelo não encontrado, tentar fallback
      if (error.message.includes('model') && this.model !== 'whisper-1') {
        debugLog('stt_openai', {
          action: 'tentando_fallback_whisper',
          cliente: cliente.nome
        });
        
        return await this.transcreverComWhisper(audioPath, cliente);
      }

      throw error;
    }
  }

  /**
   * Fallback para Whisper-1
   */
  async transcreverComWhisper(audioPath, cliente) {
    const startTime = Date.now();
    
    try {
      debugLog('stt_openai', {
        action: 'usando_whisper_fallback',
        cliente: cliente.nome
      });

      const audioStream = fs.createReadStream(audioPath);
      
      const response = await this.client.audio.transcriptions.create({
        model: 'whisper-1',
        file: audioStream,
        language: this.language,
        response_format: 'text',
        temperature: 0.0
      });

      const text = this.normalizarTexto(response);
      const duration = Date.now() - startTime;

      return {
        text,
        provider: 'openai',
        model: 'whisper-1',
        duration,
        fallback: true
      };

    } catch (error) {
      throw new Error(`Fallback Whisper também falhou: ${error.message}`);
    }
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
      name: 'OpenAI',
      models: ['whisper-1', 'gpt-4o-mini-transcribe'],
      currentModel: this.model,
      language: this.language,
      maxFileSize: '25MB',
      supportedFormats: ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm']
    };
  }
}

// Singleton
const openaiProvider = new OpenAIProvider();

export default openaiProvider;

