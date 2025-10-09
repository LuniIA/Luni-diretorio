#!/usr/bin/env node
// Testes da Fase B para integração Redis
// Valida o adaptador unificado garantindo compatibilidade sem Redis ativo

import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

process.env.NODE_ENV = 'test';
process.env.DEBUG = 'false';
process.env.USE_REDIS = '0';
process.env.MONITORING_ENABLED = '0';

const cleanupPaths = new Set();
const results = [];

function trackCleanup(filePath) {
  cleanupPaths.add(path.resolve(filePath));
}

async function cleanupArtifacts() {
  for (const filePath of cleanupPaths) {
    try {
      if (fs.existsSync(filePath)) {
        fs.rmSync(filePath, { force: true });
      }
    } catch (error) {
      console.warn('Não foi possível remover artefato de teste:', filePath, error.message);
    }
  }
}

async function runTest(nome, fn) {
  const inicio = Date.now();
  process.stdout.write(`→ ${nome}... `);
  try {
    await fn();
    const duracao = Date.now() - inicio;
    console.log(`ok (${duracao}ms)`);
    results.push({ nome, ok: true, duracao });
  } catch (erro) {
    const duracao = Date.now() - inicio;
    console.log(`FALHOU (${duracao}ms)`);
    console.error('   ', erro.message);
    results.push({ nome, ok: false, duracao, erro });
  }
}

async function createStoreAdapterInstance() {
  const module = await import('./config/storeAdapter.js');
  const StoreAdapterClass = module.default.constructor;
  const adapter = new StoreAdapterClass();
  adapter.useRedis = false;
  adapter.initialized = false;
  return adapter;
}

(async () => {
  const adapter = await createStoreAdapterInstance();

  await runTest('StoreAdapter inicializa com fallback', async () => {
    await adapter.init();
    const storageInfo = adapter.getStorageInfo();
    assert.equal(storageInfo.overall, 'files', 'Sem Redis ativo deve usar fallback de arquivos');
  });

  await runTest('StoreAdapter cria e recupera sessão completa', async () => {
    const clienteId = `cliente-adapter-${Date.now()}`;
    const sessao = await adapter.getOrInitSessao(clienteId);
    assert.ok(sessao.sessionId, 'Sessão precisa possuir ID');
    assert.equal(sessao.focoAtual, null);

    trackCleanup(path.join('historico/sessoes', `session_${sessao.sessionId}.json`));

    await adapter.addMessageToSession(clienteId, 'Primeira mensagem', ['inbound']);
    const mensagens = await adapter.getSessionMessages(clienteId, 5);
    assert.equal(mensagens.length, 0, 'Fallback não expõe histórico via adapter sem Redis');

    const sessaoCompleta = await adapter.getOrInitSessao(clienteId);
    assert.equal(sessaoCompleta._session?.context?.messages?.length, 1, 'Sessão interna deve acumular mensagens');

    await adapter.updateSessionFocus(clienteId, 'follow_up');
    const atualizada = await adapter.getOrInitSessao(clienteId);
    assert.equal(atualizada.focoAtual, 'follow_up');

    const resumo = await adapter.setSessionSummary(clienteId, 'Resumo teste');
    assert.equal(resumo, false, 'Fallback não persiste resumo, deve retornar false');
  });

  await runTest('StoreAdapter gerencia focos no fallback', async () => {
    const focoId = `focus-adapter-${Date.now()}`;
    await adapter.atualizarFocos(focoId, {
      duvidasRecentes: ['Vocês atendem aos sábados?']
    });

    const focos = await adapter.getFocos(focoId);
    assert.ok(Array.isArray(focos?.focos?.duvidasRecentes));
    assert.equal(focos.focos.duvidasRecentes.includes('Vocês atendem aos sábados?'), true);

    const focoPath = path.join('focos', `focos_${focoId}.json`);
    trackCleanup(focoPath);

    const focosValidos = await adapter.getFocosValidos(focoId);
    assert.ok(focosValidos?.focos, 'Fallback deve fornecer focos válidos');
  });

  await runTest('StoreAdapter executa withLock em fallback sem bloquear', async () => {
    const clienteId = `cliente-lock-${Date.now()}`;
    const sessao = await adapter.getOrInitSessao(clienteId);
    trackCleanup(path.join('historico/sessoes', `session_${sessao.sessionId}.json`));

    const lockResult = await adapter.withLock(clienteId, 'agenda', 5, async () => 'ok');
    assert.equal(lockResult.locked, false);
    assert.equal(lockResult.result, 'ok');
  });

  await runTest('StoreAdapter reporta métricas e health no fallback', async () => {
    const metrics = await adapter.getMetrics();
    assert.equal(metrics.useRedis, false);
    assert.equal(metrics.sessionStore.useRedis, false);
    assert.equal(metrics.focoStore.useRedis, false);

    const health = await adapter.healthCheck();
    assert.equal(health, true);
  });

  await cleanupArtifacts();

  const falhas = results.filter(r => !r.ok);
  if (falhas.length) {
    console.log(`\n❌ ${falhas.length} teste(s) falharam na Fase B.`);
    falhas.forEach(falha => {
      console.log(` - ${falha.nome}`);
    });
    process.exit(1);
  }

  console.log('\n✅ Testes da Fase B concluídos com sucesso!');
  process.exit(0);
})();
