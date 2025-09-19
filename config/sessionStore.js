// config/sessionStore.js
// Store de sessões com Redis - velocidade, economia e memória inteligente
// Mantém API compatível com sessionManager.js atual

import redisClient from './redisClient.js';
import { debugLog } from '../Utils/debugLog.js';

const TTL_SECONDS = Number(process.env.REDIS_TTL_SECONDS || 259200); // 72h
const MAX_MESSAGES = 20; // janela deslizante de mensagens

class SessionStore {
  constructor() {
    this.useRedis = process.env.USE_REDIS === "1";
    this.redis = null;
    this.fallbackStore = null; // será inicializado se necessário
  }

  async init() {
    if (this.useRedis) {
      try {
        this.redis = await redisClient.connect();
        const isHealthy = await redisClient.healthCheck();
        if (!isHealthy) {
          debugLog('sessionStore', { warning: 'Redis unhealthy, falling back to file storage' });
          this.useRedis = false;
        }
      } catch (error) {
        debugLog('sessionStore', { error: 'Redis init failed, using fallback', message: error.message });
        this.useRedis = false;
      }
    }

    if (!this.useRedis) {
      // Lazy load do fallback para não quebrar se não existir
      try {
        const sm = await import('../core/sessionManager.js');
        // Adapter simples para compatibilizar API usada pelo storeAdapter
        this.fallbackStore = {
          useRedis: false,
          async createSession(clienteId, metadata) {
            return sm.sessionManager.createSession(clienteId, metadata);
          },
          async getSession(sessionId) {
            return sm.sessionManager.getSession(sessionId);
          },
          async getSessionByClient(clienteId) {
            return sm.sessionManager.getSessionByClient(clienteId);
          },
          async updateSession(sessionId, updates) {
            return sm.sessionManager.updateSession(sessionId, updates);
          },
          async addMessage(sessionId, message, tags = []) {
            return sm.sessionManager.addMessage(sessionId, message, tags);
          },
          async getMessages(sessionId, limit = 12) {
            const s = sm.sessionManager.getSession(sessionId);
            return Array.isArray(s?.context?.messages)
              ? s.context.messages.slice(-limit)
              : [];
          },
          async setSummary(sessionId, summary) {
            // No-op em fallback
            return true;
          },
          async healthCheck() { return true; }
        };
      } catch (error) {
        debugLog('sessionStore', { error: 'Fallback store not available', message: error.message });
      }
    }
  }

  // ============================================================================
  // HELPERS DE CHAVES REDIS
  // ============================================================================

  _getKeys(sess) {
    const { cliente, canal, userId } = sess;
    const base = `luni:sess:${cliente}:${canal}:${userId}`;
    return {
      ctx: `${base}:ctx`,
      msgs: `${base}:msgs`,
      locks: `${base}:locks`
    };
  }

  // ============================================================================
  // API PRINCIPAL (compatível com sessionManager.js)
  // ============================================================================

  async createSession(clienteId, metadata = {}) {
    if (this.useRedis && this.redis) {
      return await this._createSessionRedis(clienteId, metadata);
    }
    
    if (this.fallbackStore) {
      return this.fallbackStore.createSession(clienteId, metadata);
    }
    
    throw new Error('No storage backend available');
  }

  async getSession(sessionId) {
    if (this.useRedis && this.redis) {
      return await this._getSessionRedis(sessionId);
    }
    
    if (this.fallbackStore) {
      return this.fallbackStore.getSession(sessionId);
    }
    
    return null;
  }

  async getSessionByClient(clienteId) {
    if (this.useRedis && this.redis) {
      return await this._getSessionByClientRedis(clienteId);
    }
    
    if (this.fallbackStore) {
      return this.fallbackStore.getSessionByClient(clienteId);
    }
    
    return null;
  }

  async updateSession(sessionId, updates) {
    if (this.useRedis && this.redis) {
      return await this._updateSessionRedis(sessionId, updates);
    }
    
    if (this.fallbackStore) {
      return this.fallbackStore.updateSession(sessionId, updates);
    }
    
    return null;
  }

  async addMessage(sessionId, message, tags = []) {
    if (this.useRedis && this.redis) {
      return await this._addMessageRedis(sessionId, message, tags);
    }
    
    if (this.fallbackStore) {
      return this.fallbackStore.addMessage(sessionId, message, tags);
    }
    
    return null;
  }

  // ============================================================================
  // IMPLEMENTAÇÃO REDIS
  // ============================================================================

  async _createSessionRedis(clienteId, metadata) {
    const sessionId = this._generateSessionId();
    const now = Date.now();
    
    const session = {
      id: sessionId,
      clienteId,
      createdAt: now,
      lastActivity: now,
      metadata: {
        focoAtual: null,
        etapaFunil: 'descoberta',
        primeiraInteracao: true,
        ...metadata
      },
      context: {
        messages: [],
        variables: {},
        tags: [],
        ultimaInteracaoTimestamp: now
      },
      stats: {
        messageCount: 0,
        totalTime: 0
      }
    };

    const base = `luni:sess:${clienteId}:default:${sessionId}`;
    const keys = { ctx: `${base}:ctx`, msgs: `${base}:msgs`, locks: `${base}:locks` };
    
    try {
      const pipeline = this.redis.multi();
      
      // Salva contexto principal
      pipeline.hSet(keys.ctx, {
        'sessionId': sessionId,
        'clienteId': clienteId,
        'createdAt': String(now),
        'lastActivity': String(now),
        'metadata': JSON.stringify(session.metadata),
        'context': JSON.stringify(session.context),
        'stats': JSON.stringify(session.stats)
      });
      
      // Define TTL
      pipeline.expire(keys.ctx, TTL_SECONDS);
      pipeline.expire(keys.msgs, TTL_SECONDS);
      
      // Mapeia cliente -> sessionId
      pipeline.set(`luni:client:${clienteId}`, sessionId, 'EX', TTL_SECONDS);

      // Mapeia sessionId -> base (para chaves determinísticas)
      pipeline.set(`luni:sess:id:${sessionId}`, base, 'EX', TTL_SECONDS);
      
      await pipeline.exec();
      
      debugLog('sessionStore', { action: 'createSession', sessionId, clienteId, storage: 'redis' });
      return session;
      
    } catch (error) {
      debugLog('sessionStore', { error: 'Redis createSession failed', message: error.message });
      throw error;
    }
  }

  async _getSessionRedis(sessionId) {
    try {
      const base = await this.redis.get(`luni:sess:id:${sessionId}`);
      if (!base) return null;
      const ctxKey = `${base}:ctx`;
      const data = await this.redis.hGetAll(ctxKey);
      
      if (!data.sessionId) return null;
      
      // Verifica se não expirou
      const lastActivity = Number(data.lastActivity);
      const now = Date.now();
      if (now - lastActivity > TTL_SECONDS * 1000) {
        await this._cleanupSession(sessionId);
        return null;
      }
      
      return {
        id: data.sessionId,
        clienteId: data.clienteId,
        createdAt: Number(data.createdAt),
        lastActivity: lastActivity,
        metadata: JSON.parse(data.metadata || '{}'),
        context: JSON.parse(data.context || '{}'),
        stats: JSON.parse(data.stats || '{}')
      };
      
    } catch (error) {
      debugLog('sessionStore', { error: 'Redis getSession failed', message: error.message });
      return null;
    }
  }

  async _getSessionByClientRedis(clienteId) {
    try {
      const sessionId = await this.redis.get(`luni:client:${clienteId}`);
      if (!sessionId) return null;
      
      return await this._getSessionRedis(sessionId);
    } catch (error) {
      debugLog('sessionStore', { error: 'Redis getSessionByClient failed', message: error.message });
      return null;
    }
  }

  async _updateSessionRedis(sessionId, updates) {
    try {
      const session = await this._getSessionRedis(sessionId);
      if (!session) return null;
      
      const now = Date.now();
      session.lastActivity = now;
      
      // Atualiza campos
      if (updates.metadata) {
        Object.assign(session.metadata, updates.metadata);
      }
      if (updates.context) {
        Object.assign(session.context, updates.context);
      }
      if (updates.stats) {
        Object.assign(session.stats, updates.stats);
      }
      
      // Atualiza campos diretos
      Object.keys(updates).forEach(key => {
        if (!['metadata', 'context', 'stats'].includes(key)) {
          session[key] = updates[key];
        }
      });
      
      // Salva no Redis
      const base = await this.redis.get(`luni:sess:id:${sessionId}`);
      if (base) {
        const ctxKey = `${base}:ctx`;
        const pipeline = this.redis.multi();
        pipeline.hSet(ctxKey, {
          'lastActivity': String(now),
          'metadata': JSON.stringify(session.metadata),
          'context': JSON.stringify(session.context),
          'stats': JSON.stringify(session.stats)
        });
        pipeline.expire(ctxKey, TTL_SECONDS);
        await pipeline.exec();
      }
      
      debugLog('sessionStore', { action: 'updateSession', sessionId, storage: 'redis' });
      return session;
      
    } catch (error) {
      debugLog('sessionStore', { error: 'Redis updateSession failed', message: error.message });
      return null;
    }
  }

  async _addMessageRedis(sessionId, message, tags = []) {
    try {
      const session = await this._getSessionRedis(sessionId);
      if (!session) return null;
      
      const now = Date.now();
      const messageData = {
        text: message,
        timestamp: now,
        tags: tags
      };
      
      // Adiciona mensagem à lista
      const base = await this.redis.get(`luni:sess:id:${sessionId}`);
      if (base) {
        const msgsKey = `${base}:msgs`;
        const pipeline = this.redis.multi();
        pipeline.lPush(msgsKey, JSON.stringify(messageData));
        pipeline.lTrim(msgsKey, 0, MAX_MESSAGES - 1);
        pipeline.expire(msgsKey, TTL_SECONDS);
        await pipeline.exec();
      }
      
      // Atualiza estatísticas
      session.stats.messageCount++;
      session.metadata.primeiraInteracao = false;
      
      return await this._updateSessionRedis(sessionId, {
        stats: session.stats,
        metadata: session.metadata
      });
      
    } catch (error) {
      debugLog('sessionStore', { error: 'Redis addMessage failed', message: error.message });
      return null;
    }
  }

  // ============================================================================
  // FUNCIONALIDADES ESPECÍFICAS DO REDIS
  // ============================================================================

  async getMessages(sessionId, limit = 12) {
    if (!this.useRedis || !this.redis) return [];
    
    try {
      const base = await this.redis.get(`luni:sess:id:${sessionId}`);
      if (!base) return [];
      const msgsKey = `${base}:msgs`;
      const messages = await this.redis.lRange(msgsKey, 0, limit - 1);
      
      return messages
        .map(msg => {
          try { return JSON.parse(msg); } 
          catch { return null; }
        })
        .filter(Boolean);
        
    } catch (error) {
      debugLog('sessionStore', { error: 'Redis getMessages failed', message: error.message });
      return [];
    }
  }

  async setFocus(sessionId, focus) {
    if (!this.useRedis || !this.redis) return false;
    
    try {
      const base = await this.redis.get(`luni:sess:id:${sessionId}`);
      if (!base) return false;
      const ctxKey = `${base}:ctx`;
      await this.redis.hSet(ctxKey, 'focus', JSON.stringify(focus), 'last_intent_at', String(Date.now()));
      await this.redis.expire(ctxKey, TTL_SECONDS);
      
      return true;
    } catch (error) {
      debugLog('sessionStore', { error: 'Redis setFocus failed', message: error.message });
      return false;
    }
  }

  async setSummary(sessionId, summary) {
    if (!this.useRedis || !this.redis) return false;
    
    try {
      const base = await this.redis.get(`luni:sess:id:${sessionId}`);
      if (!base) return false;
      const ctxKey = `${base}:ctx`;
      const truncatedSummary = (summary || "").slice(0, 400);
      await this.redis.hSet(ctxKey, 'summary', truncatedSummary);
      await this.redis.expire(ctxKey, TTL_SECONDS);
      
      return true;
    } catch (error) {
      debugLog('sessionStore', { error: 'Redis setSummary failed', message: error.message });
      return false;
    }
  }

  async withLock(sessionId, name, ttlSec = 30, fn) {
    if (!this.useRedis || !this.redis) {
      // Fallback sem lock se Redis não disponível
      return { locked: false, result: await fn() };
    }
    
    try {
      const base = await this.redis.get(`luni:sess:id:${sessionId}`);
      if (!base) return { locked: true };
      const lockKey = `${base}:locks:${name}`;
      const ok = await this.redis.set(lockKey, "1", { NX: true, EX: ttlSec });
      
      if (!ok) return { locked: true };
      
      try {
        return { locked: false, result: await fn() };
      } finally {
        await this.redis.del(lockKey);
      }
      
    } catch (error) {
      debugLog('sessionStore', { error: 'Redis lock failed', message: error.message });
      // Em caso de erro, executa sem lock
      return { locked: false, result: await fn() };
    }
  }

  // ============================================================================
  // UTILITÁRIOS
  // ============================================================================

  _generateSessionId() {
    return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async _cleanupSession(sessionId) {
    try {
      const base = await this.redis.get(`luni:sess:id:${sessionId}`);
      if (!base) return;
      const ctxKey = `${base}:ctx`;
      const msgsKey = `${base}:msgs`;
      await this.redis.del([ctxKey, msgsKey]);
      await this.redis.del(`luni:sess:id:${sessionId}`);
      // Remove mapeamento cliente->sessão se apontar para esta sessão
      const parts = base.split(':'); // ['luni','sess',clienteId,'default',sessionId]
      const clienteId = parts[2];
      const current = await this.redis.get(`luni:client:${clienteId}`);
      if (current === sessionId) {
        await this.redis.del(`luni:client:${clienteId}`);
      }
    } catch (error) {
      debugLog('sessionStore', { error: 'Redis cleanup failed', message: error.message });
    }
  }

  async healthCheck() {
    if (this.useRedis) {
      return await redisClient.healthCheck();
    }
    return true; // Fallback sempre considerado saudável
  }
}

// Singleton instance
const sessionStore = new SessionStore();

export default sessionStore;
