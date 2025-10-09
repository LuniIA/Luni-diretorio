#!/usr/bin/env node
// scripts/deploy-staging.js
// Script para deploy em staging da Fase C

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import monitoringSystem from '../config/monitoring.js';

console.log('🚀 Deploy em Staging - Fase C - Redis Luni\n');

// ============================================================================
// CONFIGURAÇÃO DE STAGING
// ============================================================================

const STAGING_CONFIG = {
  redisUrl: process.env.STAGING_REDIS_URL || 'redis://127.0.0.1:6379',
  monitoringEnabled: true,
  testClients: ['barbeariaimperial', 'belezavivaestetica'], // clientes para teste
  testDuration: 30 * 60 * 1000, // 30 minutos
  healthCheckInterval: 5 * 60 * 1000, // 5 minutos
  alertThresholds: {
    maxLatency: 50, // ms
    maxErrorRate: 0.05, // 5%
    minHitRate: 0.8, // 80%
    maxFallbacks: 10
  }
};

// ============================================================================
// FUNÇÕES AUXILIARES
// ============================================================================

function runCommand(command, description) {
  try {
    console.log(`📋 ${description}...`);
    const result = execSync(command, { encoding: 'utf8', stdio: 'pipe' });
    console.log(`✅ ${description} - OK`);
    return result;
  } catch (error) {
    console.log(`❌ ${description} - FALHOU`);
    console.log(`   Erro: ${error.message}`);
    return null;
  }
}

function checkPrerequisites() {
  console.log('🔍 Verificando pré-requisitos...\n');
  
  const checks = [
    { name: 'Node.js', command: 'node --version' },
    { name: 'Docker', command: 'docker --version' },
    { name: 'Redis', command: 'docker ps | grep redis-luni' }
  ];
  
  let allPassed = true;
  
  for (const check of checks) {
    const result = runCommand(check.command, `Verificando ${check.name}`);
    if (!result) {
      allPassed = false;
    }
  }
  
  return allPassed;
}

// ============================================================================
// DEPLOY EM STAGING
// ============================================================================

async function deployStaging() {
  console.log('🚀 Iniciando deploy em staging...\n');

  // 1. Verificar pré-requisitos
  if (!checkPrerequisites()) {
    console.log('❌ Pré-requisitos não atendidos. Abortando deploy.');
    return false;
  }

  // 2. Configurar ambiente de staging
  console.log('⚙️ Configurando ambiente de staging...\n');
  
  // Backup da configuração atual
  const currentEnv = process.env.USE_REDIS;
  const currentRedisUrl = process.env.REDIS_URL;
  
  try {
    // Configurar para staging
    process.env.USE_REDIS = "1";
    process.env.REDIS_URL = STAGING_CONFIG.redisUrl;
    process.env.MONITORING_ENABLED = "1";
    
    console.log('✅ Ambiente de staging configurado');
    console.log(`   Redis URL: ${STAGING_CONFIG.redisUrl}`);
    console.log(`   Monitoring: ${STAGING_CONFIG.monitoringEnabled ? 'Enabled' : 'Disabled'}`);
  } catch (error) {
    console.log('❌ Erro ao configurar ambiente:', error.message);
    return false;
  }

  // 3. Executar testes de integração
  console.log('\n🧪 Executando testes de integração...\n');
  
  const faseAResult = runCommand('node test_redis_fase_a.js', 'Testes Fase A (fallback e resiliência)');
  if (!faseAResult) {
    console.log('❌ Testes da Fase A falharam. Abortando deploy.');
    return false;
  }

  const faseBResult = runCommand('node test_redis_fase_b.js', 'Testes Fase B (adapter unificado)');
  if (!faseBResult) {
    console.log('❌ Testes da Fase B falharam. Abortando deploy.');
    return false;
  }

  // 4. Iniciar monitoramento
  console.log('\n📊 Iniciando sistema de monitoramento...\n');
  
  monitoringSystem.reset();
  console.log('✅ Monitoramento iniciado');

  // 5. Teste com clientes reais
  console.log('\n👥 Testando com clientes reais...\n');
  
  const clientTestResults = await testWithRealClients();
  if (!clientTestResults.success) {
    console.log('❌ Testes com clientes reais falharam.');
    return false;
  }

  // 6. Monitoramento contínuo
  console.log('\n📈 Iniciando monitoramento contínuo...\n');
  
  const monitoringResult = await startContinuousMonitoring();
  
  // 7. Restaurar configuração original
  process.env.USE_REDIS = currentEnv;
  process.env.REDIS_URL = currentRedisUrl;
  delete process.env.MONITORING_ENABLED;

  // 8. Gerar relatório final
  console.log('\n📋 Gerando relatório final...\n');
  
  const report = await monitoringSystem.generateStagingReport();
  await saveStagingReport(report);

  console.log('\n🎉 Deploy em staging concluído!');
  console.log(`📊 Status: ${report.summary.status}`);
  console.log(`⏱️ Uptime: ${report.summary.uptime.hours}h ${report.summary.uptime.minutes}m`);
  console.log(`📈 Sucesso: ${report.summary.successRate}`);
  console.log(`⚡ Latência: ${report.summary.avgLatency}`);
  console.log(`🎯 Hit Rate: ${report.summary.redisHitRate}`);
  console.log(`💰 Redução Tokens: ${report.summary.tokenReduction}`);

  return monitoringResult.healthy;
}

// ============================================================================
// TESTE COM CLIENTES REAIS
// ============================================================================

async function testWithRealClients() {
  const results = {
    success: true,
    clients: []
  };

  for (const clientName of STAGING_CONFIG.testClients) {
    console.log(`📝 Testando cliente: ${clientName}`);
    
    try {
      // Verificar se o cliente existe
      const clientPath = path.join('./clientes', `${clientName}.json`);
      if (!fs.existsSync(clientPath)) {
        console.log(`   ⚠️ Cliente ${clientName} não encontrado, pulando...`);
        continue;
      }

      // Teste básico de carregamento
      const testResult = runCommand(
        `node -e "import('./clienteLoader.js').then(m => { const cliente = m.carregarCliente('${clientName}'); console.log('Cliente carregado:', cliente ? 'OK' : 'FALHOU'); })"`,
        `Carregamento ${clientName}`
      );

      if (testResult) {
        results.clients.push({ name: clientName, status: 'success' });
        console.log(`   ✅ ${clientName} - OK`);
      } else {
        results.clients.push({ name: clientName, status: 'failed' });
        results.success = false;
        console.log(`   ❌ ${clientName} - FALHOU`);
      }

    } catch (error) {
      results.clients.push({ name: clientName, status: 'error', error: error.message });
      results.success = false;
      console.log(`   ❌ ${clientName} - ERRO: ${error.message}`);
    }
  }

  return results;
}

// ============================================================================
// MONITORAMENTO CONTÍNUO
// ============================================================================

async function startContinuousMonitoring() {
  console.log('📊 Iniciando monitoramento contínuo...');
  console.log(`⏱️ Duração: ${STAGING_CONFIG.testDuration / 60000} minutos`);
  console.log(`🔍 Intervalo: ${STAGING_CONFIG.healthCheckInterval / 60000} minutos\n`);

  const startTime = Date.now();
  const endTime = startTime + STAGING_CONFIG.testDuration;
  let checkCount = 0;
  let healthyChecks = 0;

  while (Date.now() < endTime) {
    checkCount++;
    
    try {
      // Verificar saúde do sistema
      const isHealthy = monitoringSystem.isHealthy();
      if (isHealthy) {
        healthyChecks++;
      }

      // Verificar thresholds
      const alerts = monitoringSystem.checkThresholds();
      
      // Mostrar status
      const elapsed = Math.floor((Date.now() - startTime) / 60000);
      const metrics = await monitoringSystem.getMetrics();
      
      console.log(`[${elapsed}m] Check #${checkCount}: ${isHealthy ? '✅' : '❌'} | ` +
        `Lat: ${metrics.operations.avgLatency.toFixed(1)}ms | ` +
        `Hit: ${metrics.redis.hitRate} | ` +
        `Errors: ${metrics.operations.failed}/${metrics.operations.total}`);

      // Mostrar alertas se houver
      if (alerts.length > 0) {
        alerts.forEach(alert => {
          console.log(`   ⚠️ ${alert.type}: ${alert.message}`);
        });
      }

      // Aguardar próximo check
      await new Promise(resolve => setTimeout(resolve, STAGING_CONFIG.healthCheckInterval));

    } catch (error) {
      console.log(`❌ Erro no monitoramento: ${error.message}`);
    }
  }

  const healthRate = (healthyChecks / checkCount) * 100;
  const isOverallHealthy = healthRate >= 90; // 90% dos checks saudáveis

  console.log(`\n📊 Monitoramento concluído:`);
  console.log(`   Checks: ${checkCount}`);
  console.log(`   Saudáveis: ${healthyChecks} (${healthRate.toFixed(1)}%)`);
  console.log(`   Status: ${isOverallHealthy ? '✅ SAUDÁVEL' : '❌ PROBLEMAS'}`);

  return {
    healthy: isOverallHealthy,
    healthRate,
    totalChecks: checkCount,
    healthyChecks
  };
}

// ============================================================================
// SALVAR RELATÓRIO
// ============================================================================

async function saveStagingReport(report) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join('./staging-reports', `staging-report-${timestamp}.json`);
  
  // Criar diretório se não existir
  const reportsDir = path.dirname(reportPath);
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  // Salvar relatório
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`📄 Relatório salvo: ${reportPath}`);

  // Salvar resumo
  const summaryPath = path.join('./staging-reports', 'latest-summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify({
    timestamp: report.timestamp,
    status: report.summary.status,
    uptime: report.summary.uptime,
    successRate: report.summary.successRate,
    avgLatency: report.summary.avgLatency,
    redisHitRate: report.summary.redisHitRate,
    tokenReduction: report.summary.tokenReduction
  }, null, 2));

  console.log(`📄 Resumo salvo: ${summaryPath}`);
}

// ============================================================================
// FUNÇÕES DE MANUTENÇÃO
// ============================================================================

function showStagingStatus() {
  console.log('📊 Status do Staging:\n');
  
  // Verificar se existe relatório recente
  const summaryPath = './staging-reports/latest-summary.json';
  if (fs.existsSync(summaryPath)) {
    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
    
    console.log('Último relatório:');
    console.log(`   Timestamp: ${summary.timestamp}`);
    console.log(`   Status: ${summary.status}`);
    console.log(`   Uptime: ${summary.uptime.hours}h ${summary.uptime.minutes}m`);
    console.log(`   Sucesso: ${summary.successRate}`);
    console.log(`   Latência: ${summary.avgLatency}`);
    console.log(`   Hit Rate: ${summary.redisHitRate}`);
    console.log(`   Redução Tokens: ${summary.tokenReduction}`);
  } else {
    console.log('❌ Nenhum relatório de staging encontrado');
  }
}

function cleanupStaging() {
  console.log('🧹 Limpando dados de staging...\n');
  
  // Limpar Redis
  runCommand(
    'docker exec redis-luni redis-cli -a senha-forte-luni-2024 FLUSHDB',
    'Limpando Redis'
  );
  
  // Resetar monitoramento
  monitoringSystem.reset();
  console.log('✅ Monitoramento resetado');
  
  console.log('\n✅ Limpeza concluída');
}

// ============================================================================
// CLI
// ============================================================================

const command = process.argv[2];

switch (command) {
  case 'status':
    showStagingStatus();
    break;
  case 'cleanup':
    cleanupStaging();
    break;
  case 'deploy':
  default:
    deployStaging().then(success => {
      process.exit(success ? 0 : 1);
    });
    break;
}
