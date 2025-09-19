// config/focoStore.js
// Store de focos com Redis - velocidade e memória inteligente
// Mantém API compatível com focoManager.js atual

import redisClient from './redisClient.js';
import { debugLog } from '../Utils/debugLog.js';

const TTL_SECONDS = Number(process.env.REDIS_TTL_SECONDS || 259200); // 72h
const EXPIRACAO_HORAS = 72;

// Limites por categoria (mantidos do focoManager original)
const LIMITES = {
  duvidasRecentes: 5,
  produto: 5,
  itemIndefinido: 5,
  agendamento: 5,
};

class FocoStore {
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
          debugLog('focoStore', { warning: 'Redis unhealthy, falling back to file storage' });
          this.useRedis = false;
        }
      } catch (error) {
        debugLog('focoStore', { error: 'Redis init failed, using fallback', message: error.message });
        this.useRedis = false;
      }
    }

    if (!this.useRedis) {
      // Lazy load do fallback
      try {
        const focoManager = await import('../focos/helpers/focoManager.js');
        this.fallbackStore = focoManager;
      } catch (error) {
        debugLog('focoStore', { error: 'Fallback store not available', message: error.message });
      }
    }
  }

  // ============================================================================
  // HELPERS DE CHAVES REDIS
  // ============================================================================

  _getFocoKey(nomeArquivo) {
    return `luni:foco:${nomeArquivo}:ctx`;
  }

  _getExpirationKey(nomeArquivo) {
    return `luni:foco:${nomeArquivo}:exp`;
  }

  // ============================================================================
  // API PRINCIPAL (compatível com focoManager.js)
  // ============================================================================

  async atualizarFocos(nomeArquivo, novosDados) {
    if (this.useRedis && this.redis) {
      return await this._atualizarFocosRedis(nomeArquivo, novosDados);
    }
    
    if (this.fallbackStore) {
      return await this.fallbackStore.atualizarFocos(nomeArquivo, novosDados);
    }
    
    throw new Error('No storage backend available');
  }

  async limparFocosExpirados(nomeArquivo) {
    if (this.useRedis && this.redis) {
      return await this._limparFocosExpiradosRedis(nomeArquivo);
    }
    
    if (this.fallbackStore) {
      return await this.fallbackStore.limparFocosExpirados(nomeArquivo);
    }
    
    return false;
  }

  async getFocos(nomeArquivo) {
    if (this.useRedis && this.redis) {
      return await this._getFocosRedis(nomeArquivo);
    }
    
    if (this.fallbackStore) {
      return this.fallbackStore.getFocos(nomeArquivo);
    }
    
    return this._schemaPadrao();
  }

  async getFocosValidos(nomeArquivo) {
    if (this.useRedis && this.redis) {
      return await this._getFocosValidosRedis(nomeArquivo);
    }
    
    if (this.fallbackStore) {
      return this.fallbackStore.getFocosValidos(nomeArquivo);
    }
    
    return this._schemaPadrao();
  }

  // ============================================================================
  // IMPLEMENTAÇÃO REDIS
  // ============================================================================

  async _atualizarFocosRedis(nomeArquivo, novosDados) {
    try {
      const focoKey = this._getFocoKey(nomeArquivo);
      const expKey = this._getExpirationKey(nomeArquivo);
      
      // Carrega focos atuais
      const focosAtuais = await this._getFocosRedis(nomeArquivo);
      const focos = focosAtuais.focos || {};
      
      // Processa novos dados
      for (const chave of Object.keys(novosDados || {})) {
        const novoValor = novosDados[chave];
        
        if (chave === 'duvidasRecentes') {
          const atuais = Array.isArray(focos.duvidasRecentes) ? focos.duvidasRecentes : [];
          const novas = Array.isArray(novoValor) ? novoValor : [String(novoValor)];
          focos.duvidasRecentes = this._mesclarDuvidas(atuais, novas);
          continue;
        }
        
        if (chave === 'produto') {
          const atuais = Array.isArray(focos.produto) ? focos.produto : [];
          const novas = Array.isArray(novoValor) ? novoValor : [novoValor];
          focos.produto = this._mesclarProdutos(atuais, novas);
          continue;
        }
        
        if (chave === 'itemIndefinido') {
          const atuais = Array.isArray(focos.itemIndefinido) ? focos.itemIndefinido : [];
          const novas = Array.isArray(novoValor) ? novoValor : [novoValor];
          focos.itemIndefinido = this._mesclarIndefinidos(atuais, novas);
          continue;
        }
        
        if (chave === 'agendamento') {
          const atuais = Array.isArray(focos.agendamento) ? focos.agendamento : [];
          const novas = Array.isArray(novoValor) ? novoValor : [novoValor];
          focos.agendamento = this._mesclarAgendamentos(atuais, novas);
          continue;
        }
        
        // Merge raso para objetos
        if (typeof novoValor === 'object' && novoValor !== null && !Array.isArray(novoValor)) {
          focos[chave] = { ...(focos[chave] || {}), ...novoValor };
        } else {
          focos[chave] = novoValor;
        }
      }
      
      // Salva no Redis
      const pipeline = this.redis.multi();
      
      // Salva focos principais
      pipeline.hSet(focoKey, {
        'focos': JSON.stringify(focos),
        'atualizado_em': this._agoraISO(),
        'nomeArquivo': nomeArquivo
      });
      
      // Define TTL
      pipeline.expire(focoKey, TTL_SECONDS);
      pipeline.expire(expKey, TTL_SECONDS);
      
      await pipeline.exec();
      
      debugLog('focoStore', { action: 'atualizarFocos', nomeArquivo, chaves: Object.keys(novosDados || {}), storage: 'redis' });
      return true;
      
    } catch (error) {
      debugLog('focoStore', { error: 'Redis atualizarFocos failed', message: error.message });
      throw error;
    }
  }

  async _limparFocosExpiradosRedis(nomeArquivo) {
    try {
      const focoKey = this._getFocoKey(nomeArquivo);
      const focos = await this._getFocosRedis(nomeArquivo);
      
      if (!focos.focos) return false;
      
      let mudou = false;
      const agora = Date.now();
      const expiracaoMs = EXPIRACAO_HORAS * 60 * 60 * 1000;
      
      // Limpa arrays com timestamps
      ['produto', 'itemIndefinido', 'agendamento'].forEach(categoria => {
        if (Array.isArray(focos.focos[categoria])) {
          const original = focos.focos[categoria].length;
          focos.focos[categoria] = focos.focos[categoria].filter(item => {
            if (item.timestamp) {
              return (agora - item.timestamp) < expiracaoMs;
            }
            return true; // mantém itens sem timestamp
          });
          if (focos.focos[categoria].length !== original) {
            mudou = true;
          }
        }
      });
      
      if (mudou) {
        await this.redis.hSet(focoKey, 'focos', JSON.stringify(focos.focos));
        await this.redis.expire(focoKey, TTL_SECONDS);
      }
      
      debugLog('focoStore', { action: 'limparFocosExpirados', nomeArquivo, mudou, storage: 'redis' });
      return mudou;
      
    } catch (error) {
      debugLog('focoStore', { error: 'Redis limparFocosExpirados failed', message: error.message });
      return false;
    }
  }

  async _getFocosRedis(nomeArquivo) {
    try {
      const focoKey = this._getFocoKey(nomeArquivo);
      const data = await this.redis.hGetAll(focoKey);
      
      if (!data.focos) {
        // Cria estrutura padrão se não existir
        const schema = this._schemaPadrao();
        await this.redis.hSet(focoKey, {
          'focos': JSON.stringify(schema.focos),
          'atualizado_em': schema.atualizado_em,
          'nomeArquivo': nomeArquivo
        });
        await this.redis.expire(focoKey, TTL_SECONDS);
        return schema;
      }
      
      return {
        focos: JSON.parse(data.focos),
        atualizado_em: data.atualizado_em || this._agoraISO(),
        nomeArquivo: data.nomeArquivo || nomeArquivo
      };
      
    } catch (error) {
      debugLog('focoStore', { error: 'Redis getFocos failed', message: error.message });
      return this._schemaPadrao();
    }
  }

  async _getFocosValidosRedis(nomeArquivo) {
    try {
      const focos = await this._getFocosRedis(nomeArquivo);
      const clone = JSON.parse(JSON.stringify(focos));
      
      // Remove itens expirados
      if (Array.isArray(clone.focos?.produto)) {
        clone.focos.produto = this._removerItensExpirados(clone.focos.produto);
      }
      if (Array.isArray(clone.focos?.itemIndefinido)) {
        clone.focos.itemIndefinido = this._removerItensExpirados(clone.focos.itemIndefinido);
      }
      if (Array.isArray(clone.focos?.agendamento)) {
        clone.focos.agendamento = this._removerItensExpirados(clone.focos.agendamento);
      }
      
      // Aplica limites
      if (Array.isArray(clone.focos?.duvidasRecentes)) {
        clone.focos.duvidasRecentes = (clone.focos.duvidasRecentes || []).slice(-LIMITES.duvidasRecentes);
      }
      if (Array.isArray(clone.focos?.produto)) {
        clone.focos.produto = (clone.focos.produto || []).slice(-LIMITES.produto);
      }
      if (Array.isArray(clone.focos?.itemIndefinido)) {
        clone.focos.itemIndefinido = (clone.focos.itemIndefinido || []).slice(-LIMITES.itemIndefinido);
      }
      if (Array.isArray(clone.focos?.agendamento)) {
        clone.focos.agendamento = (clone.focos.agendamento || []).slice(-LIMITES.agendamento);
      }
      
      return clone;
      
    } catch (error) {
      debugLog('focoStore', { error: 'Redis getFocosValidos failed', message: error.message });
      return this._schemaPadrao();
    }
  }

  // ============================================================================
  // FUNCIONALIDADES ESPECÍFICAS DO REDIS
  // ============================================================================

  async setFocoRapido(nomeArquivo, categoria, valor) {
    if (!this.useRedis || !this.redis) return false;
    
    try {
      const focoKey = this._getFocoKey(nomeArquivo);
      const focos = await this._getFocosRedis(nomeArquivo);
      
      if (!focos.focos) focos.focos = {};
      if (!Array.isArray(focos.focos[categoria])) focos.focos[categoria] = [];
      
      // Adiciona com timestamp
      const item = {
        valor: valor,
        timestamp: Date.now()
      };
      
      focos.focos[categoria].push(item);
      
      // Aplica limite
      if (LIMITES[categoria]) {
        focos.focos[categoria] = focos.focos[categoria].slice(-LIMITES[categoria]);
      }
      
      await this.redis.hSet(focoKey, 'focos', JSON.stringify(focos.focos));
      await this.redis.expire(focoKey, TTL_SECONDS);
      
      return true;
    } catch (error) {
      debugLog('focoStore', { error: 'Redis setFocoRapido failed', message: error.message });
      return false;
    }
  }

  async getFocoAtivo(nomeArquivo) {
    if (!this.useRedis || !this.redis) return null;
    
    try {
      const focos = await this._getFocosValidosRedis(nomeArquivo);
      return focos.focos?.focoAtual || null;
    } catch (error) {
      debugLog('focoStore', { error: 'Redis getFocoAtivo failed', message: error.message });
      return null;
    }
  }

  async setFocoAtivo(nomeArquivo, foco) {
    if (!this.useRedis || !this.redis) return false;
    
    try {
      const focoKey = this._getFocoKey(nomeArquivo);
      const focos = await this._getFocosRedis(nomeArquivo);
      
      if (!focos.focos) focos.focos = {};
      focos.focos.focoAtual = foco;
      
      await this.redis.hSet(focoKey, 'focos', JSON.stringify(focos.focos));
      await this.redis.expire(focoKey, TTL_SECONDS);
      
      return true;
    } catch (error) {
      debugLog('focoStore', { error: 'Redis setFocoAtivo failed', message: error.message });
      return false;
    }
  }

  // ============================================================================
  // HELPERS (mantidos do focoManager original)
  // ============================================================================

  _agoraISO() {
    return new Date().toISOString();
  }

  _schemaPadrao() {
    return {
      focos: {},
      atualizado_em: this._agoraISO(),
    };
  }

  _removerItensExpirados(array) {
    if (!Array.isArray(array)) return [];
    const agora = Date.now();
    const expiracaoMs = EXPIRACAO_HORAS * 60 * 60 * 1000;
    return array.filter(item => {
      if (item.timestamp) {
        return (agora - item.timestamp) < expiracaoMs;
      }
      return true;
    });
  }

  _mesclarDuvidas(atuais = [], novas = []) {
    const todas = [...atuais, ...novas];
    const unicas = [...new Set(todas)];
    return unicas.slice(-LIMITES.duvidasRecentes);
  }

  _mesclarProdutos(atuais = [], novas = []) {
    const todas = [...atuais, ...novas];
    const dedup = todas.filter((item, index, arr) => 
      arr.findIndex(i => i.valor === item.valor) === index
    );
    return dedup.slice(-LIMITES.produto);
  }

  _mesclarIndefinidos(atuais = [], novas = []) {
    const todas = [...atuais, ...novas];
    const dedup = todas.filter((item, index, arr) => 
      arr.findIndex(i => i.valor === item.valor) === index
    );
    return dedup.slice(-LIMITES.itemIndefinido);
  }

  _mesclarAgendamentos(atuais = [], novas = []) {
    const todas = [...atuais, ...novas];
    const dedup = todas.filter((item, index, arr) => 
      arr.findIndex(i => i.valor === item.valor) === index
    );
    return dedup.slice(-LIMITES.agendamento);
  }

  async healthCheck() {
    if (this.useRedis) {
      return await redisClient.healthCheck();
    }
    return true;
  }
}

// Singleton instance
const focoStore = new FocoStore();

export default focoStore;
