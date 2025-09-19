// config/redisClient.js
// Cliente Redis otimizado para a Luni - velocidade, economia e escala

import { createClient } from 'redis';
import { debugLog } from '../Utils/debugLog.js';

class RedisClient {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.connectionRetries = 0;
    this.maxRetries = 3;
  }

  async connect() {
    if (this.client && this.isConnected) {
      return this.client;
    }

    try {
      const url = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
      
      this.client = createClient({
        url,
        socket: {
          connectTimeout: 5000,
          lazyConnect: true,
          reconnectStrategy: (retries) => {
            if (retries > this.maxRetries) {
              debugLog('redisClient', { error: 'Max retries exceeded', retries });
              return false; // stop retrying
            }
            return Math.min(retries * 100, 3000); // exponential backoff
          }
        },
        commandsQueueMaxLength: 1000,
        isolationPoolOptions: {
          min: 0,
          max: 10
        }
      });

      // Event handlers
      this.client.on('connect', () => {
        debugLog('redisClient', { status: 'connected' });
        this.isConnected = true;
        this.connectionRetries = 0;
      });

      this.client.on('ready', () => {
        debugLog('redisClient', { status: 'ready' });
      });

      this.client.on('error', (err) => {
        debugLog('redisClient', { error: err.message, code: err.code });
        this.isConnected = false;
      });

      this.client.on('end', () => {
        debugLog('redisClient', { status: 'disconnected' });
        this.isConnected = false;
      });

      await this.client.connect();
      return this.client;

    } catch (error) {
      debugLog('redisClient', { error: 'Connection failed', message: error.message });
      this.isConnected = false;
      throw error;
    }
  }

  async disconnect() {
    if (this.client && this.isConnected) {
      await this.client.quit();
      this.isConnected = false;
    }
  }

  async healthCheck() {
    try {
      if (!this.client || !this.isConnected) {
        await this.connect();
      }
      await this.client.ping();
      return true;
    } catch (error) {
      debugLog('redisClient', { error: 'Health check failed', message: error.message });
      return false;
    }
  }

  getClient() {
    return this.client;
  }
}

// Singleton instance
const redisClient = new RedisClient();

export default redisClient;
