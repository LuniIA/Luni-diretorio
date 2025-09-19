#!/usr/bin/env node
// scripts/setup-redis.js
// Script para configurar Redis local para a Luni

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const REDIS_CONTAINER_NAME = 'redis-luni';
const REDIS_PORT = 6379;
const REDIS_PASSWORD = 'senha-forte-luni-2024';

console.log('🚀 Configurando Redis local para Luni...\n');

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

function checkDocker() {
  try {
    execSync('docker --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function checkContainerExists(containerName) {
  try {
    execSync(`docker ps -a --filter "name=${containerName}" --format "{{.Names}}"`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function checkPortAvailable(port) {
  try {
    execSync(`netstat -an | findstr :${port}`, { stdio: 'pipe' });
    return false; // porta em uso
  } catch {
    return true; // porta livre
  }
}

// ============================================================================
// SETUP PRINCIPAL
// ============================================================================

async function setupRedis() {
  console.log('🔍 Verificando pré-requisitos...\n');

  // 1. Verifica se Docker está instalado
  if (!checkDocker()) {
    console.log('❌ Docker não encontrado!');
    console.log('   Instale o Docker Desktop: https://www.docker.com/products/docker-desktop/');
    process.exit(1);
  }
  console.log('✅ Docker encontrado');

  // 2. Verifica se porta está livre
  if (!checkPortAvailable(REDIS_PORT)) {
    console.log(`❌ Porta ${REDIS_PORT} já está em uso!`);
    console.log('   Pare outros serviços ou use uma porta diferente');
    process.exit(1);
  }
  console.log(`✅ Porta ${REDIS_PORT} está livre\n`);

  // 3. Para container existente se houver
  if (checkContainerExists(REDIS_CONTAINER_NAME)) {
    console.log('🔄 Container Redis existente encontrado...');
    runCommand(
      `docker stop ${REDIS_CONTAINER_NAME}`,
      'Parando container existente'
    );
    runCommand(
      `docker rm ${REDIS_CONTAINER_NAME}`,
      'Removendo container existente'
    );
  }

  // 4. Baixa imagem Redis se necessário
  console.log('📦 Baixando imagem Redis...');
  runCommand(
    'docker pull redis:7',
    'Baixando Redis 7'
  );

  // 5. Cria e inicia container Redis
  console.log('\n🚀 Iniciando Redis...');
  const dockerCommand = `docker run -d --name ${REDIS_CONTAINER_NAME} -p ${REDIS_PORT}:6379 redis:7 redis-server --requirepass ${REDIS_PASSWORD} --maxmemory 512mb --maxmemory-policy allkeys-lru`;
  
  const result = runCommand(dockerCommand, 'Criando container Redis');
  
  if (!result) {
    console.log('\n❌ Falha ao criar container Redis');
    process.exit(1);
  }

  // 6. Aguarda Redis inicializar
  console.log('\n⏳ Aguardando Redis inicializar...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // 7. Testa conexão
  console.log('\n🧪 Testando conexão...');
  const testCommand = `docker exec ${REDIS_CONTAINER_NAME} redis-cli -a ${REDIS_PASSWORD} ping`;
  const testResult = runCommand(testCommand, 'Testando conexão Redis');
  
  if (!testResult || !testResult.includes('PONG')) {
    console.log('\n❌ Falha no teste de conexão');
    process.exit(1);
  }

  // 8. Cria arquivo .env se não existir
  console.log('\n📝 Configurando variáveis de ambiente...');
  const envPath = path.join(process.cwd(), '.env');
  const envContent = `# Configuração Redis Luni
USE_REDIS=1
REDIS_URL=redis://default:${REDIS_PASSWORD}@127.0.0.1:${REDIS_PORT}
REDIS_TTL_SECONDS=259200
DEBUG=true
LOG_LEVEL=info

# Outras configurações da Luni podem ser adicionadas aqui
`;

  if (!fs.existsSync(envPath)) {
    fs.writeFileSync(envPath, envContent);
    console.log('✅ Arquivo .env criado');
  } else {
    console.log('⚠️ Arquivo .env já existe - verifique se as configurações Redis estão corretas');
  }

  // 9. Mostra informações finais
  console.log('\n🎉 Redis configurado com sucesso!');
  console.log('\n📋 Informações da instalação:');
  console.log(`   Container: ${REDIS_CONTAINER_NAME}`);
  console.log(`   Porta: ${REDIS_PORT}`);
  console.log(`   Senha: ${REDIS_PASSWORD}`);
  console.log(`   URL: redis://default:${REDIS_PASSWORD}@127.0.0.1:${REDIS_PORT}`);
  
  console.log('\n🔧 Comandos úteis:');
  console.log(`   Parar Redis: docker stop ${REDIS_CONTAINER_NAME}`);
  console.log(`   Iniciar Redis: docker start ${REDIS_CONTAINER_NAME}`);
  console.log(`   Ver logs: docker logs ${REDIS_CONTAINER_NAME}`);
  console.log(`   Acessar CLI: docker exec -it ${REDIS_CONTAINER_NAME} redis-cli -a ${REDIS_PASSWORD}`);
  
  console.log('\n🧪 Para testar a implementação:');
  console.log('   node test_redis_fase_a.js');
  
  console.log('\n🚀 Para usar na Luni:');
  console.log('   USE_REDIS=1 node index.js');
}

// ============================================================================
// FUNÇÕES DE MANUTENÇÃO
// ============================================================================

function showStatus() {
  console.log('📊 Status do Redis Luni:\n');
  
  const status = runCommand(`docker ps --filter "name=${REDIS_CONTAINER_NAME}" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"`, 'Verificando status');
  
  if (status) {
    console.log(status);
  } else {
    console.log('❌ Container Redis não está rodando');
  }
}

function showLogs() {
  console.log('📋 Logs do Redis Luni:\n');
  runCommand(`docker logs ${REDIS_CONTAINER_NAME} --tail 20`, 'Mostrando logs');
}

function cleanup() {
  console.log('🧹 Limpando Redis Luni...\n');
  
  runCommand(`docker stop ${REDIS_CONTAINER_NAME}`, 'Parando container');
  runCommand(`docker rm ${REDIS_CONTAINER_NAME}`, 'Removendo container');
  
  console.log('✅ Limpeza concluída');
}

// ============================================================================
// CLI
// ============================================================================

const command = process.argv[2];

switch (command) {
  case 'status':
    showStatus();
    break;
  case 'logs':
    showLogs();
    break;
  case 'cleanup':
    cleanup();
    break;
  case 'setup':
  default:
    setupRedis();
    break;
}
