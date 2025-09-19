// variableManager.js v1.4 – Variáveis semânticas com expiração + IO atômico + contexto rico + LOG
// ------------------------------------------------------------------------------------------------
// Compatível com v1.3 (mesmas exports e assinaturas):
//   - carregarVariaveis(nomeArquivoCliente) -> objeto cru do arquivo
//   - salvarVariaveis(nomeArquivoCliente, variaveis)
//   - salvarVariavel(nomeArquivoCliente, chave, valor, duracaoMs?)
//   - getVariaveisValidas(nomeArquivoCliente) -> { chave: valor }
//   - deletarVariavel(nomeArquivoCliente, chave)
//   - renovarVariavel(nomeArquivoCliente, chave, novaDuracaoMs?)
//   - Aliases: carregarVariaveisValidas, definirVariavel
//
// [LUNI-UPD] Recursos novos (não quebram legado):
//   - Escrita ATÔMICA (tmp + rename) e backup _bak ao recuperar JSON corrompido.
//   - __meta: { version, lastWrite, stats: { writes, prunes, expirations } }
//   - Limpeza por limite de tamanho (MAX_KEYS) além de TTL.
//   - Merge inteligente de valor se for objeto (preserva subcampos).
//   - Campos de contexto sugeridos (opcional, você pode gravar direto no "valor"):
//       { intencao, item, slots:{data,hora,regiao,quantidade,acao}, funil:{etapa,status} }
//     *Nada é obrigatório; se vier string/number/boolean segue igual.*
//
// Observação: todo o comportamento antigo permanece idêntico se você continuar usando da mesma forma.

import fs from 'fs';
import path from 'path';
import { debugLog } from '../Utils/debugLog.js';

const VARIAVEL_DIR = './variaveis';
const TEMPO_PADRAO_EXPIRACAO_MS = 1000 * 60 * 60 * 48; // 48 h
const MAX_KEYS = 200; // [LUNI-UPD] limite saudável para não crescer indefinidamente
const FILE_VERSION = 2; // [LUNI-UPD] versionamento do layout

/* ───────────────── helpers ──────────────── */
function garantirDiretorio() {
  if (!fs.existsSync(VARIAVEL_DIR)) {
    fs.mkdirSync(VARIAVEL_DIR, { recursive: true });
    debugLog('variableManager > garantirDiretorio', { criada: VARIAVEL_DIR });
  }
}

function getVariavelPath(nomeArquivoCliente) {
  return path.join(VARIAVEL_DIR, `${nomeArquivoCliente}_vars.json`);
}

function getBackupPath(filePath) {
  return filePath.replace(/\.json$/i, '_bak.json');
}

// [LUNI-UPD] leitura resiliente com fallback de backup
function safeRead(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    debugLog('variableManager > safeRead:erroPrimario', { filePath, erro: e.message });
    // tenta backup
    const bak = getBackupPath(filePath);
    if (fs.existsSync(bak)) {
      try {
        const rawBak = fs.readFileSync(bak, 'utf-8');
        const parsed = JSON.parse(rawBak);
        debugLog('variableManager > safeRead:recuperadoBackup', { filePath, bak });
        // restaura o arquivo principal a partir do backup
        fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2), 'utf-8');
        return parsed;
      } catch (e2) {
        debugLog('variableManager > safeRead:backupCorrompido', { bak, erro: e2.message });
      }
    }
    // nada feito: retorna estrutura nova
    return {};
  }
}

// [LUNI-UPD] escrita atômica + backup
function safeWrite(filePath, dataObj) {
  const tmp = filePath + '.tmp';
  try {
    // cria backup do arquivo atual (se existir)
    if (fs.existsSync(filePath)) {
      const bak = getBackupPath(filePath);
      fs.copyFileSync(filePath, bak);
    }
    fs.writeFileSync(tmp, JSON.stringify(dataObj, null, 2), 'utf-8');
    fs.renameSync(tmp, filePath);
  } catch (e) {
    debugLog('variableManager > safeWrite:erro', { filePath, erro: e.message });
    // em último caso, tenta uma escrita direta (não atômica)
    try {
      fs.writeFileSync(filePath, JSON.stringify(dataObj, null, 2), 'utf-8');
    } catch (e2) {
      console.error('Erro crítico ao salvar variáveis:', e2.message);
    }
  } finally {
    // limpa tmp se sobrou
    if (fs.existsSync(tmp)) {
      try { fs.unlinkSync(tmp); } catch {}
    }
  }
}

function isPlainObject(o) {
  return o && typeof o === 'object' && !Array.isArray(o);
}

// [LUNI-UPD] merge preferindo novos campos (sem sobrescrever com null/undefined)
function mergePreferindoNovos(base, novo) {
  if (!isPlainObject(base) || !isPlainObject(novo)) return novo ?? base;
  const out = { ...base };
  for (const k of Object.keys(novo)) {
    const v = novo[k];
    if (v === undefined || v === null) continue;
    if (isPlainObject(v) && isPlainObject(out[k])) {
      out[k] = mergePreferindoNovos(out[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function ensureMeta(obj) {
  if (!isPlainObject(obj.__meta)) obj.__meta = {};
  if (typeof obj.__meta.version !== 'number') obj.__meta.version = FILE_VERSION;
  if (!isPlainObject(obj.__meta.stats)) obj.__meta.stats = { writes: 0, prunes: 0, expirations: 0 };
  return obj;
}

/* ───────────────── CRUD de arquivo ───────────────────── */
export function carregarVariaveis(nomeArquivoCliente) {
  garantirDiretorio();
  const filePath = getVariavelPath(nomeArquivoCliente);
  if (!fs.existsSync(filePath)) {
    debugLog('variableManager > carregarVariaveis', { filePath, status: 'nao_existe' });
    return {};
  }
  const data = safeRead(filePath);
  const keys = Object.keys(data).filter(k => k !== '__meta');
  debugLog('variableManager > carregarVariaveis', { filePath, keys });
  return data;
}

export function salvarVariaveis(nomeArquivoCliente, variaveis) {
  garantirDiretorio();
  const filePath = getVariavelPath(nomeArquivoCliente);
  const data = ensureMeta(variaveis || {});
  data.__meta.lastWrite = new Date().toISOString();
  data.__meta.stats.writes = (data.__meta.stats.writes || 0) + 1;
  safeWrite(filePath, data);
  const keys = Object.keys(data).filter(k => k !== '__meta');
  debugLog('variableManager > salvarVariaveis', { filePath, keys });
}

/* ───────────────── API pública ───────────────────────── */
export function salvarVariavel(
  nomeArquivoCliente,
  chave,
  valor,
  duracaoMs = TEMPO_PADRAO_EXPIRACAO_MS
) {
  const filePath = getVariavelPath(nomeArquivoCliente);
  const todas = carregarVariaveis(nomeArquivoCliente);

  // [LUNI-UPD] upgrade/meta
  ensureMeta(todas);

  // [LUNI-UPD] se já existir e for objeto, mescla para não perder sub-infos
  const atual = todas[chave]?.valor;
  const novoValor = (isPlainObject(atual) && isPlainObject(valor))
    ? mergePreferindoNovos(atual, valor)
    : valor;

  todas[chave] = {
    valor: novoValor,
    criado_em: new Date().toISOString(),
    expira_em: new Date(Date.now() + duracaoMs).toISOString(),
  };

  // [LUNI-UPD] poda por quantidade (remove mais antigos, ignorando __meta)
  const chavesNegocio = Object.keys(todas).filter(k => k !== '__meta');
  if (chavesNegocio.length > MAX_KEYS) {
    const ordenadas = chavesNegocio
      .map(k => ({ k, criado: Date.parse(todas[k]?.criado_em || 0) }))
      .sort((a, b) => a.criado - b.criado);
    const excedente = chavesNegocio.length - MAX_KEYS;
    const remover = ordenadas.slice(0, excedente).map(x => x.k);
    for (const k of remover) delete todas[k];
    todas.__meta.stats.prunes = (todas.__meta.stats.prunes || 0) + remover.length;
    debugLog('variableManager > prune', { nomeArquivoCliente, removidas: remover });
  }

  salvarVariaveis(nomeArquivoCliente, todas);
  debugLog('variableManager > salvarVariavel', {
    nomeArquivoCliente, chave, tipoValor: typeof novoValor, expira_em: todas[chave].expira_em
  });
}

export function getVariaveisValidas(nomeArquivoCliente) {
  const filePath = getVariavelPath(nomeArquivoCliente);
  const todas = carregarVariaveis(nomeArquivoCliente);
  const agora = Date.now();
  const validas = {};
  let expiradas = [];

  for (const [chave, obj] of Object.entries(todas)) {
    if (chave === '__meta') continue;
    const expira = new Date(obj.expira_em).getTime();
    if (expira > agora) {
      validas[chave] = obj.valor;
    } else {
      delete todas[chave];
      expiradas.push(chave);
    }
  }

  if (expiradas.length) {
    ensureMeta(todas);
    todas.__meta.stats.expirations = (todas.__meta.stats.expirations || 0) + expiradas.length;
    salvarVariaveis(nomeArquivoCliente, todas); // remove expiradas
    debugLog('variableManager > limpezaExpiradas', { nomeArquivoCliente, chavesRemovidas: expiradas });
  }

  debugLog('variableManager > getVariaveisValidas', {
    nomeArquivoCliente,
    keysValidas: Object.keys(validas)
  });
  return validas;
}

export function deletarVariavel(nomeArquivoCliente, chave) {
  const todas = carregarVariaveis(nomeArquivoCliente);
  if (todas[chave]) {
    delete todas[chave];
    salvarVariaveis(nomeArquivoCliente, todas);
    debugLog('variableManager > deletarVariavel', { nomeArquivoCliente, chave });
  }
}

export function renovarVariavel(nomeArquivoCliente, chave, novaDuracaoMs = TEMPO_PADRAO_EXPIRACAO_MS) {
  const todas = carregarVariaveis(nomeArquivoCliente);
  if (todas[chave]) {
    todas[chave].expira_em = new Date(Date.now() + novaDuracaoMs).toISOString();
    salvarVariaveis(nomeArquivoCliente, todas);
    debugLog('variableManager > renovarVariavel', {
      nomeArquivoCliente, chave, novaExpira: todas[chave].expira_em
    });
  }
}

/* ───────────────── aliases de compatibilidade ─────────── */
export const carregarVariaveisValidas = getVariaveisValidas;
export const definirVariavel = salvarVariavel;
