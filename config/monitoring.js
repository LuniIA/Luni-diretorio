// config/monitoring.js
// Sistema de monitoramento avançado para Fase C
// Métricas, alertas e performance tracking

import storeAdapter from './storeAdapter.js';
import { debugLog } from '../Utils/debugLog.js';

class MonitoringSystem {
  constructor() {
    this.metrics = {
      operations: {
        total: 0,
        success: 0,
        failed: 0,
        avgLatency: 0
      },
      redis: {
        hits: 0,
        misses: 0,
        errors: 0,
        fallbacks: 0
      },
      performance: {
        sessionOperations: [],
        focusOperations: [],
        promptOperations: []
      },
      tokens: {
        saved: 0,
        totalUsed: 0,
        reductionPercentage: 0
      }
    };
    
    this.alerts = [];
    this.startTime = Date.now();
    this.isEnabled = process.env.MONITORING_ENABLED === "1";
  }

  // ============================================================================
  // MÉTRICAS DE OPERAÇÕES
  // ============================================================================

  async trackOperation(operation, startTime, success = true, error = null) {
    if (!this.isEnabled) return;

    const duration = Date.now() - startTime;
    
    this.metrics.operations.total++;
    if (success) {
      this.metrics.operations.success++;
    } else {
      this.metrics.operations.failed++;
      this.alerts.push({
        type: 'operation_failed',
        operation,
        error: error?.message || 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }

    // Calcula latência média
    const totalLatency = this.metrics.operations.avgLatency * (this.metrics.operations.total - 1) + duration;
    this.metrics.operations.avgLatency = totalLatency / this.metrics.operations.total;

    // Armazena para análise de performance
    this.metrics.performance[`${operation}Operations`]?.push({
      duration,
      success,
      timestamp: Date.now()
    });

    // Limita histórico para não consumir muita memória
    if (this.metrics.performance[`${operation}Operations`]?.length > 1000) {
      this.metrics.performance[`${operation}Operations`] = 
        this.metrics.performance[`${operation}Operations`].slice(-500);
    }

    debugLog('monitoring', {
      operation,
      duration,
      success,
      avgLatency: this.metrics.operations.avgLatency
    });
  }

  // ============================================================================
  // MÉTRICAS REDIS
  // ============================================================================

  trackRedisHit() {
    if (!this.isEnabled) return;
    this.metrics.redis.hits++;
  }

  trackRedisMiss() {
    if (!this.isEnabled) return;
    this.metrics.redis.misses++;
  }

  trackRedisError(error) {
    if (!this.isEnabled) return;
    this.metrics.redis.errors++;
    
    this.alerts.push({
      type: 'redis_error',
      error: error?.message || 'Unknown Redis error',
      timestamp: new Date().toISOString()
    });
  }

  trackFallback() {
    if (!this.isEnabled) return;
    this.metrics.redis.fallbacks++;
    
    this.alerts.push({
      type: 'fallback_used',
      message: 'Redis fallback activated',
      timestamp: new Date().toISOString()
    });
  }

  // ============================================================================
  // MÉTRICAS DE TOKENS
  // ============================================================================

  trackTokenUsage(originalTokens, optimizedTokens) {
    if (!this.isEnabled) return;

    const saved = originalTokens - optimizedTokens;
    this.metrics.tokens.saved += saved;
    this.metrics.tokens.totalUsed += optimizedTokens;
    
    if (originalTokens > 0) {
      this.metrics.tokens.reductionPercentage = 
        (this.metrics.tokens.saved / (this.metrics.tokens.saved + this.metrics.tokens.totalUsed)) * 100;
    }

    debugLog('monitoring', {
      tokensSaved: saved,
      totalSaved: this.metrics.tokens.saved,
      reductionPercentage: this.metrics.tokens.reductionPercentage.toFixed(2)
    });
  }

  // ============================================================================
  // ALERTAS E THRESHOLDS
  // ============================================================================

  checkThresholds() {
    if (!this.isEnabled) return;

    const alerts = [];

    // Latência alta
    if (this.metrics.operations.avgLatency > 50) {
      alerts.push({
        type: 'high_latency',
        message: `Latência média alta: ${this.metrics.operations.avgLatency.toFixed(2)}ms`,
        severity: 'warning'
      });
    }

    // Taxa de erro alta
    const errorRate = this.metrics.operations.failed / this.metrics.operations.total;
    if (errorRate > 0.05) { // 5%
      alerts.push({
        type: 'high_error_rate',
        message: `Taxa de erro alta: ${(errorRate * 100).toFixed(2)}%`,
        severity: 'error'
      });
    }

    // Muitos fallbacks
    if (this.metrics.redis.fallbacks > 10) {
      alerts.push({
        type: 'many_fallbacks',
        message: `Muitos fallbacks: ${this.metrics.redis.fallbacks}`,
        severity: 'warning'
      });
    }

    // Hit rate baixo
    const totalRequests = this.metrics.redis.hits + this.metrics.redis.misses;
    if (totalRequests > 0) {
      const hitRate = this.metrics.redis.hits / totalRequests;
      if (hitRate < 0.8) { // 80%
        alerts.push({
          type: 'low_hit_rate',
          message: `Hit rate baixo: ${(hitRate * 100).toFixed(2)}%`,
          severity: 'warning'
        });
      }
    }

    this.alerts.push(...alerts);
    return alerts;
  }

  // ============================================================================
  // RELATÓRIOS E MÉTRICAS
  // ============================================================================

  async getMetrics() {
    const storageInfo = await storeAdapter.getMetrics();
    const uptime = Date.now() - this.startTime;

    return {
      uptime: {
        seconds: Math.floor(uptime / 1000),
        minutes: Math.floor(uptime / 60000),
        hours: Math.floor(uptime / 3600000)
      },
      operations: {
        ...this.metrics.operations,
        successRate: this.metrics.operations.total > 0 
          ? (this.metrics.operations.success / this.metrics.operations.total * 100).toFixed(2) + '%'
          : '0%'
      },
      redis: {
        ...this.metrics.redis,
        hitRate: (this.metrics.redis.hits + this.metrics.redis.misses) > 0
          ? (this.metrics.redis.hits / (this.metrics.redis.hits + this.metrics.redis.misses) * 100).toFixed(2) + '%'
          : '0%'
      },
      tokens: {
        ...this.metrics.tokens,
        reductionPercentage: this.metrics.tokens.reductionPercentage.toFixed(2) + '%'
      },
      storage: storageInfo,
      alerts: this.alerts.slice(-10), // Últimos 10 alertas
      performance: {
        p95: this.calculatePercentile(95),
        p99: this.calculatePercentile(99)
      }
    };
  }

  calculatePercentile(percentile) {
    const allOperations = [
      ...this.metrics.performance.sessionOperations,
      ...this.metrics.performance.focusOperations,
      ...this.metrics.performance.promptOperations
    ].map(op => op.duration);

    if (allOperations.length === 0) return 0;

    allOperations.sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * allOperations.length) - 1;
    return allOperations[index] || 0;
  }

  // ============================================================================
  // RELATÓRIOS DE STAGING
  // ============================================================================

  async generateStagingReport() {
    const metrics = await this.getMetrics();
    
    return {
      timestamp: new Date().toISOString(),
      summary: {
        status: this.getOverallStatus(),
        uptime: metrics.uptime,
        totalOperations: metrics.operations.total,
        successRate: metrics.operations.successRate,
        avgLatency: metrics.operations.avgLatency.toFixed(2) + 'ms',
        redisHitRate: metrics.redis.hitRate,
        tokenReduction: metrics.tokens.reductionPercentage
      },
      details: metrics,
      recommendations: this.generateRecommendations(metrics)
    };
  }

  getOverallStatus() {
    const errorRate = this.metrics.operations.failed / this.metrics.operations.total;
    const avgLatency = this.metrics.operations.avgLatency;
    
    if (errorRate > 0.1 || avgLatency > 100) return 'CRITICAL';
    if (errorRate > 0.05 || avgLatency > 50) return 'WARNING';
    return 'HEALTHY';
  }

  generateRecommendations(metrics) {
    const recommendations = [];

    if (metrics.operations.avgLatency > 50) {
      recommendations.push({
        type: 'performance',
        priority: 'high',
        message: 'Considerar otimizações de performance ou aumentar recursos Redis'
      });
    }

    if (parseFloat(metrics.redis.hitRate) < 80) {
      recommendations.push({
        type: 'cache',
        priority: 'medium',
        message: 'Hit rate baixo - verificar estratégia de cache e TTL'
      });
    }

    if (this.metrics.redis.fallbacks > 5) {
      recommendations.push({
        type: 'reliability',
        priority: 'high',
        message: 'Muitos fallbacks - verificar conectividade Redis'
      });
    }

    if (parseFloat(metrics.tokens.reductionPercentage) < 10) {
      recommendations.push({
        type: 'optimization',
        priority: 'low',
        message: 'Redução de tokens baixa - revisar estratégia de resumo'
      });
    }

    return recommendations;
  }

  // ============================================================================
  // UTILITÁRIOS
  // ============================================================================

  reset() {
    this.metrics = {
      operations: { total: 0, success: 0, failed: 0, avgLatency: 0 },
      redis: { hits: 0, misses: 0, errors: 0, fallbacks: 0 },
      performance: { sessionOperations: [], focusOperations: [], promptOperations: [] },
      tokens: { saved: 0, totalUsed: 0, reductionPercentage: 0 }
    };
    this.alerts = [];
    this.startTime = Date.now();
  }

  isHealthy() {
    const errorRate = this.metrics.operations.failed / this.metrics.operations.total;
    return errorRate < 0.05 && this.metrics.operations.avgLatency < 50;
  }
}

// Singleton instance
const monitoringSystem = new MonitoringSystem();

export default monitoringSystem;
