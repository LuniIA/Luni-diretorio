// config/storeAdapter.js
// Adaptador para trocar entre Redis e arquivos - Fase B
// Mantém compatibilidade total com código existente

import sessionStore from './sessionStore.js';
import focoStore from './focoStore.js';
import { debugLog } from '../Utils/debugLog.js';
import monitoringSystem from './monitoring.js';

class StoreAdapter {
  constructor() {
    this.useRedis = process.env.USE_REDIS === "1";
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;

    try {
      await sessionStore.init();
      await focoStore.init();
      
      debugLog('storeAdapter', { 
        status: 'initialized', 
        useRedis: this.useRedis,
        sessionStore: sessionStore.useRedis ? 'redis' : 'fallback',
        focoStore: focoStore.useRedis ? 'redis' : 'fallback'
      });
      
      this.initialized = true;
    } catch (error) {
      debugLog('storeAdapter', { error: 'init failed', message: error.message });
      throw error;
    }
  }

  // ============================================================================
  // SESSION MANAGER ADAPTER (compatível com core/sessionManager.js)
  // ============================================================================

  async getOrInitSessao(clienteId) {
    const startTime = Date.now();
    
    try {
      await this.init();
      
      let sessao = await sessionStore.getSessionByClient(clienteId);
      
      if (!sessao) {
        // Cria nova sessão
        sessao = await sessionStore.createSession(clienteId, {
          focoAtual: null,
          etapaFunil: 'descoberta',
          primeiraInteracao: true
        });
        
        debugLog('storeAdapter', { 
          action: 'createSession', 
          clienteId, 
          sessionId: sessao.id,
          storage: sessionStore.useRedis ? 'redis' : 'fallback'
        });
      }

      // Monitoramento
      await monitoringSystem.trackOperation('session', startTime, true);
      if (sessionStore.useRedis) {
        monitoringSystem.trackRedisHit();
      } else {
        monitoringSystem.trackRedisMiss();
      }

      // Retorna no formato esperado pelo código existente
      return {
        sessionId: sessao.id,
        focoAtual: sessao.metadata?.focoAtual || null,
        etapaFunil: sessao.metadata?.etapaFunil || 'descoberta',
        primeiraInteracao: sessao.metadata?.primeiraInteracao || false,
        // Mantém compatibilidade com propriedades existentes
        _session: sessao // acesso interno se necessário
      };
    } catch (error) {
      await monitoringSystem.trackOperation('session', startTime, false, error);
      monitoringSystem.trackRedisError(error);
      throw error;
    }
  }

  async addMessageToSession(clienteId, message, tags = []) {
    await this.init();
    
    const sessao = await sessionStore.getSessionByClient(clienteId);
    if (!sessao) {
      throw new Error('Sessão não encontrada');
    }

    const updatedSession = await sessionStore.addMessage(sessao.id, message, tags);
    
    debugLog('storeAdapter', { 
      action: 'addMessage', 
      clienteId, 
      sessionId: sessao.id,
      messageLength: message.length,
      storage: sessionStore.useRedis ? 'redis' : 'fallback'
    });

    return updatedSession;
  }

  async updateSessionFocus(clienteId, foco) {
    await this.init();
    
    const sessao = await sessionStore.getSessionByClient(clienteId);
    if (!sessao) {
      throw new Error('Sessão não encontrada');
    }

    await sessionStore.updateSession(sessao.id, {
      metadata: { ...sessao.metadata, focoAtual: foco }
    });

    debugLog('storeAdapter', { 
      action: 'updateFocus', 
      clienteId, 
      foco,
      storage: sessionStore.useRedis ? 'redis' : 'fallback'
    });
  }

  async getSessionMessages(clienteId, limit = 12) {
    await this.init();
    
    const sessao = await sessionStore.getSessionByClient(clienteId);
    if (!sessao) return [];

    return await sessionStore.getMessages(sessao.id, limit);
  }

  async setSessionSummary(clienteId, summary) {
    await this.init();
    
    const sessao = await sessionStore.getSessionByClient(clienteId);
    if (!sessao) return false;

    return await sessionStore.setSummary(sessao.id, summary);
  }

  // ============================================================================
  // FOCUS MANAGER ADAPTER (compatível com focos/helpers/focoManager.js)
  // ============================================================================

  async atualizarFocos(nomeArquivo, novosDados) {
    const startTime = Date.now();
    
    try {
      await this.init();
      
      debugLog('storeAdapter', { 
        action: 'atualizarFocos', 
        nomeArquivo, 
        chaves: Object.keys(novosDados || {}),
        storage: focoStore.useRedis ? 'redis' : 'fallback'
      });

      const result = await focoStore.atualizarFocos(nomeArquivo, novosDados);
      
      // Monitoramento
      await monitoringSystem.trackOperation('focus', startTime, true);
      if (focoStore.useRedis) {
        monitoringSystem.trackRedisHit();
      } else {
        monitoringSystem.trackRedisMiss();
      }
      
      return result;
    } catch (error) {
      await monitoringSystem.trackOperation('focus', startTime, false, error);
      monitoringSystem.trackRedisError(error);
      throw error;
    }
  }

  async limparFocosExpirados(nomeArquivo) {
    await this.init();
    
    return await focoStore.limparFocosExpirados(nomeArquivo);
  }

  async getFocos(nomeArquivo) {
    await this.init();
    
    return await focoStore.getFocos(nomeArquivo);
  }

  async getFocosValidos(nomeArquivo) {
    await this.init();
    
    return await focoStore.getFocosValidos(nomeArquivo);
  }

  // ============================================================================
  // FUNCIONALIDADES ESPECÍFICAS DO REDIS
  // ============================================================================

  async withLock(clienteId, name, ttlSec = 30, fn) {
    await this.init();
    
    const sessao = await sessionStore.getSessionByClient(clienteId);
    if (!sessao) {
      throw new Error('Sessão não encontrada para lock');
    }

    return await sessionStore.withLock(sessao.id, name, ttlSec, fn);
  }

  async setFocoRapido(nomeArquivo, categoria, valor) {
    await this.init();
    
    return await focoStore.setFocoRapido(nomeArquivo, categoria, valor);
  }

  async getFocoAtivo(nomeArquivo) {
    await this.init();
    
    return await focoStore.getFocoAtivo(nomeArquivo);
  }

  async setFocoAtivo(nomeArquivo, foco) {
    await this.init();
    
    return await focoStore.setFocoAtivo(nomeArquivo, foco);
  }

  // ============================================================================
  // MÉTRICAS E MONITORAMENTO
  // ============================================================================

  async getMetrics() {
    await this.init();
    
    return {
      useRedis: this.useRedis,
      sessionStore: {
        useRedis: sessionStore.useRedis,
        health: await sessionStore.healthCheck()
      },
      focoStore: {
        useRedis: focoStore.useRedis,
        health: await focoStore.healthCheck()
      }
    };
  }

  async healthCheck() {
    await this.init();
    
    const sessionHealth = await sessionStore.healthCheck();
    const focoHealth = await focoStore.healthCheck();
    
    return sessionHealth && focoHealth;
  }

  // ============================================================================
  // UTILITÁRIOS
  // ============================================================================

  isUsingRedis() {
    return this.useRedis && sessionStore.useRedis && focoStore.useRedis;
  }

  getStorageInfo() {
    return {
      sessionStore: sessionStore.useRedis ? 'redis' : 'files',
      focoStore: focoStore.useRedis ? 'redis' : 'files',
      overall: this.isUsingRedis() ? 'redis' : 'files'
    };
  }
}

// Singleton instance
const storeAdapter = new StoreAdapter();

export default storeAdapter;
