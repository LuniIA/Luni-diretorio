// focoManager.js v3.0 – Normalização de slots, deduplicação, expiração e LOG detalhado
// Mantém API pública de v2.4 e adiciona getFocosValidos

import fs from 'fs';
import path from 'path';
import { debugLog } from '../../Utils/debugLog.js'; // ajuste se necessário

const CAMINHO_PASTA = './focos';
const EXPIRACAO_HORAS = 72;

// limites por categoria
const LIMITES = {
  duvidasRecentes: 5,
  produto: 5,
  itemIndefinido: 5,
  agendamento: 5,
};

function getCaminhoFoco(nomeArquivo) {
  return path.join(CAMINHO_PASTA, `focos_${nomeArquivo}.json`);
}

/* ────────── helpers gerais ────────── */
function agoraISO() {
  return new Date().toISOString();
}

function horasEntre(a, b) {
  return (new Date(a) - new Date(b)) / (1000 * 60 * 60);
}

function garantirDiretorio() {
  if (!fs.existsSync(CAMINHO_PASTA)) {
    fs.mkdirSync(CAMINHO_PASTA, { recursive: true });
    debugLog('focoManager > criarDiretorio', { CAMINHO_PASTA });
  }
}

function schemaPadrao() {
  return {
    focos: {
      duvidasRecentes: [],
      intencaoAtual: null, // string
      produto: [],         // [{ nome, apelidos[], intencao, ultimaMencao }]
      itemIndefinido: [],  // [{ nomeMencionado, tipo, mensagemOriginal, intencaoProvavel, ultimaMencao }]
      agendamento: [],     // [{ data, hora, regiao, confirmado, ultimaInteracao }]
      contatoCliente: {},  // { nome, telefone }
    },
    atualizado_em: agoraISO(),
  };
}

/* ────────── helpers de IO ────────── */
function carregarFocos(nomeArquivo) {
  garantirDiretorio();
  const caminho = getCaminhoFoco(nomeArquivo);

  if (!fs.existsSync(caminho)) {
    const init = schemaPadrao();
    fs.writeFileSync(caminho, JSON.stringify(init, null, 2), 'utf-8');
    debugLog('focoManager > carregarFocos:init', { caminho, status: 'criado' });
    return init;
  }

  try {
    const raw = fs.readFileSync(caminho, 'utf-8');
    const data = JSON.parse(raw);

    // garante chaves mínimas se arquivo antigo existir
    const base = schemaPadrao();
    const focos = { ...base.focos, ...(data?.focos || {}) };
    const merged = { ...base, ...data, focos, atualizado_em: data?.atualizado_em || agoraISO() };

    debugLog('focoManager > carregarFocos', { caminho, keys: Object.keys(merged.focos || {}) });
    return merged;
  } catch (e) {
    console.warn('focoManager > erro ao carregar:', e.message);
    const fallback = schemaPadrao();
    debugLog('focoManager > carregarFocos:fallback', { motivo: 'json_invalido' });
    return fallback;
  }
}

function salvarFocos(nomeArquivo, dados) {
  garantirDiretorio();
  const caminho = getCaminhoFoco(nomeArquivo);
  dados.atualizado_em = agoraISO();
  fs.writeFileSync(caminho, JSON.stringify(dados, null, 2), 'utf-8');
  debugLog('focoManager > salvarFocos', { caminho, keys: Object.keys(dados.focos || {}) });
}

/* ────────── normalizadores e dedup ────────── */
function normStr(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function dedupArraySimples(arr = []) {
  return [...new Set(arr.map(v => String(v)))];
}

function dedupPorChave(lista = [], chaveFn) {
  const seen = new Set();
  const out = [];
  for (let i = lista.length - 1; i >= 0; i--) {
    const key = chaveFn(lista[i]);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(lista[i]);
    }
  }
  return out.reverse(); // mantém mais recentes no fim
}

/* Produtos: chave por nome normalizado */
function chaveProduto(p) {
  return `prod:${normStr(p?.nome)}`;
}
/* Item indefinido: chave por mensagem original normalizada */
function chaveIndef(p) {
  return `indef:${normStr(p?.mensagemOriginal || p?.nomeMencionado)}`;
}
/* Agendamento: chave por trio data|hora|regiao (normalizados) */
function chaveAgendamento(a) {
  const d = normStr(a?.data || '');
  const h = normStr(a?.hora || '');
  const r = normStr(a?.regiao || '');
  return `agd:${d}|${h}|${r}`;
}

/* ────────── limpeza por expiração ────────── */
function removerItensExpirados(lista) {
  const now = agoraISO();
  return (lista || []).filter(item => {
    const ref =
      item?.ultimaMencao ||
      item?.ultimaInteracao ||
      item?.hora ||
      item?.data ||
      now; // se não tiver referência, preserva
    const diff = Math.abs(horasEntre(now, ref));
    return diff <= EXPIRACAO_HORAS;
  });
}

/* ────────── mescladores específicos ────────── */
function mesclarDuvidas(atuais = [], novas = []) {
  const unidas = dedupArraySimples([...atuais, ...novas.map(String)]);
  return unidas.slice(-LIMITES.duvidasRecentes);
}

function mesclarProdutos(atuais = [], novas = []) {
  const combinados = [
    ...atuais,
    ...novas.map(p => ({
      ...p,
      nome: p?.nome || p?.item || 'produto',
      ultimaMencao: p?.ultimaMencao || agoraISO(),
      intencao: p?.intencao || 'interesse',
      apelidos: p?.apelidos || [],
    })),
  ];

  let dedup = dedupPorChave(combinados, chaveProduto);
  dedup = removerItensExpirados(dedup);
  if (dedup.length > LIMITES.produto) dedup = dedup.slice(-LIMITES.produto);
  return dedup;
}

function mesclarIndefinidos(atuais = [], novas = []) {
  const combinados = [
    ...atuais,
    ...novas.map(p => ({
      ...p,
      ultimaMencao: p?.ultimaMencao || agoraISO(),
      tipo: p?.tipo || 'desconhecido',
      intencaoProvavel: p?.intencaoProvavel || 'possível interesse',
    })),
  ];

  let dedup = dedupPorChave(combinados, chaveIndef);
  dedup = removerItensExpirados(dedup);
  if (dedup.length > LIMITES.itemIndefinido) dedup = dedup.slice(-LIMITES.itemIndefinido);
  return dedup;
}

function normalizarAgendamento(a = {}) {
  return {
    data: a.data ?? null,
    hora: a.hora ?? null,
    regiao: a.regiao ?? null,
    confirmado: !!a.confirmado,
    ultimaInteracao: a.ultimaInteracao || agoraISO(),
  };
}

function mesclarAgendamentos(atuais = [], novas = []) {
  const combinados = [...atuais, ...novas.map(normalizarAgendamento)];

  // se a nova entrada não define trio completo, tente "coalescer" com a última entrada aberta
  const temSlot = (x) => x.data || x.hora || x.regiao;
  if (novas.length === 1 && temSlot(novas[0]) && (!novas[0].data || !novas[0].hora || !novas[0].regiao)) {
    // tenta mesclar com o último
    const last = combinados[combinados.length - 2]; // antes da que acabamos de inserir
    const curr = combinados[combinados.length - 1];
    if (last && !last.confirmado) {
      const merged = {
        ...last,
        data: curr.data || last.data,
        hora: curr.hora || last.hora,
        regiao: curr.regiao || last.regiao,
        ultimaInteracao: curr.ultimaInteracao,
      };
      combinados.splice(combinados.length - 2, 2, merged);
    }
  }

  let dedup = dedupPorChave(combinados, chaveAgendamento);
  dedup = removerItensExpirados(dedup);
  if (dedup.length > LIMITES.agendamento) dedup = dedup.slice(-LIMITES.agendamento);
  return dedup;
}

/* ────────── API pública ────────── */
export async function atualizarFocos(nomeArquivo, novosDados) {
  const estado = carregarFocos(nomeArquivo);
  const focos = estado.focos || (estado.focos = {});

  for (const chave of Object.keys(novosDados || {})) {
    const novoValor = novosDados[chave];

    if (chave === 'duvidasRecentes') {
      const atuais = Array.isArray(focos.duvidasRecentes) ? focos.duvidasRecentes : [];
      const novas = Array.isArray(novoValor) ? novoValor : [String(novoValor)];
      focos.duvidasRecentes = mesclarDuvidas(atuais, novas);
      continue;
    }

    if (chave === 'produto') {
      const atuais = Array.isArray(focos.produto) ? focos.produto : [];
      const novas = Array.isArray(novoValor) ? novoValor : [novoValor];
      focos.produto = mesclarProdutos(atuais, novas);
      continue;
    }

    if (chave === 'itemIndefinido') {
      const atuais = Array.isArray(focos.itemIndefinido) ? focos.itemIndefinido : [];
      const novas = Array.isArray(novoValor) ? novoValor : [novoValor];
      focos.itemIndefinido = mesclarIndefinidos(atuais, novas);
      continue;
    }

    if (chave === 'agendamento') {
      const atuais = Array.isArray(focos.agendamento) ? focos.agendamento : [];
      const novas = Array.isArray(novoValor) ? novoValor : [novoValor];
      focos.agendamento = mesclarAgendamentos(atuais, novas);
      continue;
    }

    // merge raso para objetos (ex.: contatoCliente, intencaoAtual etc.)
    if (typeof novoValor === 'object' && novoValor !== null && !Array.isArray(novoValor)) {
      focos[chave] = { ...(focos[chave] || {}), ...novoValor };
    } else {
      focos[chave] = novoValor;
    }
  }

  estado.focos = focos;
  salvarFocos(nomeArquivo, estado);
  debugLog('focoManager > atualizarFocos', { nomeArquivo, chaves: Object.keys(novosDados || {}) });
}

export async function limparFocosExpirados(nomeArquivo) {
  const estado = carregarFocos(nomeArquivo);
  let alterado = false;

  for (const chave of ['produto', 'itemIndefinido', 'agendamento']) {
    const lista = estado.focos[chave];
    if (Array.isArray(lista)) {
      const filtrado = removerItensExpirados(lista);
      if (filtrado.length !== lista.length) {
        estado.focos[chave] = filtrado;
        alterado = true;
      }
    }
  }

  if (alterado) {
    salvarFocos(nomeArquivo, estado);
    debugLog('focoManager > limparFocosExpirados', { nomeArquivo });
  }
}

export async function removerFocoPorCategoria(nomeArquivo, categoria) {
  const estado = carregarFocos(nomeArquivo);
  if (estado.focos[categoria]) {
    delete estado.focos[categoria];
    salvarFocos(nomeArquivo, estado);
    debugLog('focoManager > removerFocoPorCategoria', { nomeArquivo, categoria });
  }
}

export function getFocos(nomeArquivo) {
  return carregarFocos(nomeArquivo);
}

/** Retorna focos com listas filtradas por expiração (sem persistir) */
export function getFocosValidos(nomeArquivo) {
  const estado = carregarFocos(nomeArquivo);
  const clone = JSON.parse(JSON.stringify(estado));
  if (Array.isArray(clone.focos?.produto)) clone.focos.produto = removerItensExpirados(clone.focos.produto);
  if (Array.isArray(clone.focos?.itemIndefinido)) clone.focos.itemIndefinido = removerItensExpirados(clone.focos.itemIndefinido);
  if (Array.isArray(clone.focos?.agendamento)) clone.focos.agendamento = removerItensExpirados(clone.focos.agendamento);

  // aplica limites visuais
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
}
