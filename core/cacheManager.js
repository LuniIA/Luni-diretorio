// core/cacheManager.js - Sistema unificado de cache com TTL e métricas
import { debugLog } from '../Utils/debugLog.js';

class CacheEntry {
  constructor(value, ttlMs) {
    this.value = value;
    this.createdAt = Date.now();
    this.expiresAt = this.createdAt + ttlMs;
    this.lastAccessed = this.createdAt;
  }

  isExpired() {
    return Date.now() > this.expiresAt;
  }

  touch() {
    this.lastAccessed = Date.now();
  }
}

class Cache {
  constructor(nome, options = {}) {
    this.nome = nome;
    this.ttlMs = options.ttlMs || 24 * 60 * 60 * 1000; // 24h padrão
    this.maxEntries = options.maxEntries || 100;
    this.onEvict = options.onEvict || null;
    
    this.entries = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      createdAt: Date.now()
    };
    
    // Limpeza periódica
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000); // 5 minutos
  }

  get(key) {
    const entry = this.entries.get(key);
    
    if (!entry) {
      this.stats.misses++;
      debugLog('cacheManager', `Cache '${this.nome}' MISS: ${key}`);
      return null;
    }

    if (entry.isExpired()) {
      this.entries.delete(key);
      this.stats.misses++;
      debugLog('cacheManager', `Cache '${this.nome}' EXPIRED: ${key}`);
      return null;
    }

    entry.touch();
    this.stats.hits++;
    debugLog('cacheManager', `Cache '${this.nome}' HIT: ${key}`);
    return entry.value;
  }

  set(key, value) {
    // Limpeza antes de adicionar
    this.cleanup();

    // Verificar limite de entradas
    if (this.entries.size >= this.maxEntries) {
      this.evictLRU();
    }

    const entry = new CacheEntry(value, this.ttlMs);
    this.entries.set(key, entry);
    debugLog('cacheManager', `Cache '${this.nome}' SET: ${key} (size: ${this.entries.size})`);
  }

  delete(key) {
    return this.entries.delete(key);
  }

  clear() {
    const size = this.entries.size;
    this.entries.clear();
    return size;
  }

  evictLRU() {
    let oldestKey = null;
    let oldestTime = Date.now();

    for (const [key, entry] of this.entries) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.entries.delete(oldestKey);
      this.stats.evictions++;
      
      if (this.onEvict) {
        this.onEvict(oldestKey);
      }

      // Aviso se muitas evictions
      if (this.stats.evictions % 10 === 0) {
        console.warn(`⚠️ Cache '${this.nome}': ${this.stats.evictions} evictions (maxEntries: ${this.maxEntries})`);
      }
    }
  }

  cleanup() {
    const beforeSize = this.entries.size;
    
    for (const [key, entry] of this.entries) {
      if (entry.isExpired()) {
        this.entries.delete(key);
      }
    }

    const afterSize = this.entries.size;
    if (beforeSize !== afterSize) {
      debugLog('cacheManager', `Limpeza cache '${this.nome}': ${beforeSize} → ${afterSize} entradas`);
    }
  }

  getStats() {
    return {
      ...this.stats,
      size: this.entries.size,
      maxEntries: this.maxEntries,
      ttlMs: this.ttlMs
    };
  }

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.entries.clear();
  }
}

class CacheManager {
  constructor() {
    this.caches = new Map();
    this.defaultTTLs = {
      contextoEstatico: 12 * 60 * 60 * 1000, // 12h
      historicoRecente: 24 * 60 * 60 * 1000, // 24h
      funil: 24 * 60 * 60 * 1000, // 24h
      gatilhos: 24 * 60 * 60 * 1000, // 24h
      personalidade: 24 * 60 * 60 * 1000 // 24h
    };
  }

  createCache(nome, options = {}) {
    if (this.caches.has(nome)) {
      console.warn(`⚠️ Cache '${nome}' já existe, retornando existente`);
      return this.caches.get(nome);
    }

    // Usar TTL padrão se não especificado
    if (!options.ttlMs && this.defaultTTLs[nome]) {
      options.ttlMs = this.defaultTTLs[nome];
    }

    const cache = new Cache(nome, options);
    this.caches.set(nome, cache);
    
    debugLog('cacheManager', `Cache criado: '${nome}' (TTL: ${options.ttlMs}ms, maxEntries: ${options.maxEntries || 100})`);
    
    return cache;
  }

  getCache(nome) {
    return this.caches.get(nome);
  }

  get(nome, key, clienteId = null) {
    const cache = this.caches.get(nome);
    if (!cache) {
      throw new Error(`Cache '${nome}' não encontrado`);
    }

    const fullKey = clienteId ? `${clienteId}:${key}` : key;
    return cache.get(fullKey);
  }

  set(nome, key, value, clienteId = null) {
    const cache = this.caches.get(nome);
    if (!cache) {
      throw new Error(`Cache '${nome}' não encontrado`);
    }

    const fullKey = clienteId ? `${clienteId}:${key}` : key;
    cache.set(fullKey, value);
  }

  delete(nome, key, clienteId = null) {
    const cache = this.caches.get(nome);
    if (!cache) {
      throw new Error(`Cache '${nome}' não encontrado`);
    }

    const fullKey = clienteId ? `${clienteId}:${key}` : key;
    return cache.delete(fullKey);
  }

  clear(nome) {
    const cache = this.caches.get(nome);
    if (!cache) {
      throw new Error(`Cache '${nome}' não encontrado`);
    }

    return cache.clear();
  }

  stats(nome) {
    const cache = this.caches.get(nome);
    if (!cache) {
      throw new Error(`Cache '${nome}' não encontrado`);
    }

    return cache.getStats();
  }

  getAllStats() {
    const stats = {};
    for (const [nome, cache] of this.caches) {
      stats[nome] = cache.getStats();
    }
    return stats;
  }

  destroy() {
    for (const cache of this.caches.values()) {
      cache.destroy();
    }
    this.caches.clear();
  }
}

// Instância global
export const cacheManager = new CacheManager();

// API de conveniência
export const createCache = (nome, options) => cacheManager.createCache(nome, options);
export const get = (nome, key, clienteId) => cacheManager.get(nome, key, clienteId);
export const set = (nome, key, value, clienteId) => cacheManager.set(nome, key, value, clienteId);
export const del = (nome, key, clienteId) => cacheManager.delete(nome, key, clienteId);
export const clear = (nome) => cacheManager.clear(nome);
export const stats = (nome) => cacheManager.stats(nome);
export const getAllStats = () => cacheManager.getAllStats();
