// stt/index.js - Módulo principal de Speech-to-Text
// Sistema unificado de transcrição com múltiplos provedores

import { debugLog } from '../Utils/debugLog.js';
import { logErro } from '../Utils/logger.js';
import openaiProvider from './providers/openai.js';
import whisperProvider from './providers/whisper.js';
import { processarAudio, limparArquivosTemporarios } from './utils/audioProcessor.js';

class STTManager {
  constructor() {
    this.provider = process.env.STT_PROVIDER || 'openai';
    this.fallbackProvider = 'whisper';
    this.maxDuration = parseInt(process.env.STT_MAX_DURATION || '180'); // 3 minutos
    this.supportedFormats = ['audio/ogg', 'audio/wav', 'audio/mp3', 'audio/m4a'];
    
    debugLog('stt', { 
      provider: this.provider, 
      fallback: this.fallbackProvider,
      maxDuration: this.maxDuration 
    });
  }

  /**
   * Transcreve áudio de URL (Twilio)
   */
  async transcreverAudioFromUrl(mediaUrl, contentType, cliente) {
    const startTime = Date.now();
    let tempFiles = [];
    
    try {
      // 1. Validar formato
      if (!this.supportedFormats.includes(contentType)) {
        throw new Error(`Formato não suportado: ${contentType}`);
      }

      debugLog('stt', { 
        action: 'iniciando_transcricao',
        url: mediaUrl,
        contentType,
        cliente: cliente.nome
      });

      // 2. Processar áudio (download + transcodificação)
      const { audioPath, duration } = await processarAudio(mediaUrl, contentType);
      tempFiles.push(audioPath);

      // 3. Validar duração
      if (duration > this.maxDuration) {
        throw new Error(`Áudio muito longo: ${duration}s (máximo: ${this.maxDuration}s)`);
      }

      // 4. Tentar transcrição com provedor principal
      let resultado;
      try {
        resultado = await this.transcreverComProvedor(this.provider, audioPath, cliente);
        debugLog('stt', { 
          action: 'transcricao_sucesso',
          provider: this.provider,
          duration,
          cliente: cliente.nome
        });
      } catch (error) {
        debugLog('stt', { 
          action: 'provedor_principal_falhou',
          provider: this.provider,
          error: error.message,
          cliente: cliente.nome
        });

        // 5. Fallback para provedor secundário
        if (this.fallbackProvider && this.fallbackProvider !== this.provider) {
          debugLog('stt', { 
            action: 'tentando_fallback',
            fallback: this.fallbackProvider,
            cliente: cliente.nome
          });
          
          resultado = await this.transcreverComProvedor(this.fallbackProvider, audioPath, cliente);
        } else {
          throw error;
        }
      }

      // 6. Calcular custos e métricas
      const totalTime = Date.now() - startTime;
      const custoEstimado = this.calcularCusto(duration, this.provider);

      // 7. Log de sucesso
      debugLog('stt', {
        action: 'transcricao_completa',
        provider: resultado.provider,
        duration,
        totalTime,
        custoEstimado,
        textLength: resultado.text?.length || 0,
        cliente: cliente.nome
      });

      return {
        sucesso: true,
        text: resultado.text,
        provider: resultado.provider,
        duration,
        custoEstimado,
        totalTime
      };

    } catch (error) {
      const totalTime = Date.now() - startTime;
      
      logErro(cliente, `STT Error: ${error.message}`);
      debugLog('stt', {
        action: 'transcricao_falhou',
        error: error.message,
        totalTime,
        cliente: cliente.nome
      });

      return {
        sucesso: false,
        error: error.message,
        text: null,
        totalTime
      };

    } finally {
      // 8. Limpeza de arquivos temporários
      await limparArquivosTemporarios(tempFiles);
    }
  }

  /**
   * Transcreve com provedor específico
   */
  async transcreverComProvedor(provider, audioPath, cliente) {
    switch (provider) {
      case 'openai':
        return await openaiProvider.transcrever(audioPath, cliente);
      
      case 'whisper':
        return await whisperProvider.transcrever(audioPath, cliente);
      
      default:
        throw new Error(`Provedor não suportado: ${provider}`);
    }
  }

  /**
   * Calcula custo estimado da transcrição
   */
  calcularCusto(durationSeconds, provider) {
    const durationMinutes = durationSeconds / 60;
    
    switch (provider) {
      case 'openai':
        return durationMinutes * 0.006; // $0.006/min
      
      case 'whisper':
        return durationMinutes * 0.006; // $0.006/min
      
      default:
        return 0;
    }
  }

  /**
   * Verifica se o provedor está configurado
   */
  verificarConfiguracao() {
    const configs = {
      openai: !!process.env.OPENAI_API_KEY,
      whisper: !!process.env.OPENAI_API_KEY // Whisper usa mesma API
    };

    return {
      provider: this.provider,
      fallback: this.fallbackProvider,
      configs,
      isConfigured: configs[this.provider] || configs[this.fallbackProvider]
    };
  }

  /**
   * Método de conveniência para compatibilidade
   */
  async transcreverAudio(mediaUrl, contentType) {
    // Cliente padrão para compatibilidade
    const clientePadrao = {
      nome: 'Cliente Teste',
      id: 'default'
    };
    
    const resultado = await this.transcreverAudioFromUrl(mediaUrl, contentType, clientePadrao);
    return resultado.sucesso ? resultado.text : null;
  }

  /**
   * Obtém estatísticas de uso
   */
  obterEstatisticas() {
    return {
      provider: this.provider,
      fallback: this.fallbackProvider,
      maxDuration: this.maxDuration,
      supportedFormats: this.supportedFormats,
      configuracao: this.verificarConfiguracao()
    };
  }
}

// Singleton
const sttManager = new STTManager();

export default sttManager;

