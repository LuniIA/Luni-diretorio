#!/usr/bin/env node
// Testes da Fase A para integração Redis
// Garante que stores caem em fallback de forma saudável e preservam compatibilidade

import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

// Força ambiente de teste silencioso
process.env.NODE_ENV = 'test';
process.env.DEBUG = 'false';
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

async function createSessionStoreInstance({ useRedis, redisUrl }) {
  process.env.USE_REDIS = useRedis ? '1' : '0';
  if (redisUrl) {
    process.env.REDIS_URL = redisUrl;
  }

  const module = await import('./config/sessionStore.js');
  const SessionStoreClass = module.default.constructor;
  const store = new SessionStoreClass();
  store.useRedis = useRedis;
  store.redis = null;
  store.fallbackStore = null;
  await store.init();
  return store;
}

async function createFocoStoreInstance({ useRedis, redisUrl }) {
  process.env.USE_REDIS = useRedis ? '1' : '0';
  if (redisUrl) {
    process.env.REDIS_URL = redisUrl;
  }

  const module = await import('./config/focoStore.js');
  const FocoStoreClass = module.default.constructor;
  const store = new FocoStoreClass();
  store.useRedis = useRedis;
  store.redis = null;
  store.fallbackStore = null;
  await store.init();
  return store;
}

(async () => {
  // Teste 1: fallback quando Redis indisponível
  await runTest('SessionStore usa fallback quando Redis está fora do ar', async () => {
    const store = await createSessionStoreInstance({ useRedis: true, redisUrl: 'redis://127.0.0.1:6390' });
    assert.equal(store.useRedis, false, 'Store deve desativar Redis após falha de conexão');
    assert.ok(store.fallbackStore, 'Fallback precisa estar configurado');
  });

  // Teste 2: operações básicas em fallback preservam compatibilidade
  await runTest('SessionStore fallback mantém ciclo completo de sessão', async () => {
    const clienteId = `teste-sessao-${Date.now()}`;
    const store = await createSessionStoreInstance({ useRedis: false });

    const sessao = await store.createSession(clienteId, { focoAtual: 'boasVindas' });
    assert.ok(sessao?.id, 'Sessão precisa ter ID');
    assert.equal(sessao.metadata.focoAtual, 'boasVindas');

    trackCleanup(path.join('historico/sessoes', `session_${sessao.id}.json`));

    const recuperada = await store.getSessionByClient(clienteId);
    assert.equal(recuperada?.id, sessao.id, 'Sessão recuperada deve corresponder');

    await store.addMessage(sessao.id, 'Olá, tudo bem?', ['inbound']);
    const sessaoAtualizada = await store.getSession(sessao.id);
    assert.equal(sessaoAtualizada?.context?.messages?.length, 1, 'Sessão deve acumular histórico no fallback');
    assert.equal(sessaoAtualizada.context.messages[0]?.text, 'Olá, tudo bem?');

    const resumoAtualizado = await store.setSummary(sessao.id, 'Resumo breve');
    assert.equal(resumoAtualizado, false, 'Fallback não persiste resumo, deve retornar false');
  });

  // Teste 3: FocoStore fallback mantém agregações com merge e limites
  await runTest('FocoStore fallback consolida dados de foco sem Redis', async () => {
    const focoId = `cliente-foco-${Date.now()}`;
    const store = await createFocoStoreInstance({ useRedis: false });

    await store.atualizarFocos(focoId, {
      duvidasRecentes: ['Qual o horário de atendimento?'],
      produto: [{ nome: 'Corte de cabelo', apelidos: ['corte'] }],
      itemIndefinido: [{ mensagemOriginal: 'Quero fazer um negócio', tipo: 'texto' }],
      agendamento: [{ data: '2024-01-10', hora: '14:00', regiao: 'Centro' }]
    });

    const dados = await store.getFocos(focoId);
    assert.ok(Array.isArray(dados?.focos?.duvidasRecentes), 'Duvidas recentes deve ser array');
    assert.equal(dados.focos.duvidasRecentes.includes('Qual o horário de atendimento?'), true);
    assert.equal(dados.focos.produto[0]?.nome, 'Corte de cabelo');

    const focoPath = path.join('focos', `focos_${focoId}.json`);
    trackCleanup(focoPath);

    const focosValidos = await store.getFocosValidos(focoId);
    assert.ok(focosValidos?.focos, 'Deve retornar focos válidos no fallback');

    const limpeza = await store.limparFocosExpirados(focoId);
    assert.equal(limpeza, undefined, 'Fallback mantém assinatura silenciosa para limpeza');
  });

  await cleanupArtifacts();

  const falhas = results.filter(r => !r.ok);
  if (falhas.length) {
    console.log(`\n❌ ${falhas.length} teste(s) falharam na Fase A.`);
    falhas.forEach(falha => {
      console.log(` - ${falha.nome}`);
    });
    process.exit(1);
  }

  console.log('\n✅ Testes da Fase A concluídos com sucesso!');
  process.exit(0);
})();
