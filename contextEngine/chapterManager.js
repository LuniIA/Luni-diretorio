// chapterManager.js v1.3 – Gerencia capítulos de conversa por cliente (LCE) + LOG + Contexto rico
// -----------------------------------------------------------------------------------------------
// Compatível com v1.2 (mantém exports e assinaturas):
//  - carregarCapituloAtual(nomeArquivoCliente)
//  - salvarCapitulo(nomeArquivoCliente, capituloObj)
//  - atualizarCapitulo(nomeArquivoCliente, tags = [], motivo = '')
//  - iniciarNovoCapitulo(nomeArquivoCliente, motivo = '', tags = [])
//
// [LUNI-UPD] Modo avançado:
//  - atualizarCapitulo(nomeArquivoCliente, tags, { motivo, slots, intencao, item, funil, origemMensagem, usuario })
//    > slots esperados (compatível com taggerV2): { data, hora, regiao, item, quantidade, acao }
//    > intencao: 'agendar' | 'comprar' | 'informar' | ... (livre)
//    > item: { nome, origem?, tipo?, sinonimo? } (se não vier, será inferido de slots.item)
//    > funil: { etapa: 'descoberta'|'avaliacao'|'intencao'|'confirmacao'|'finalizado'|'cancelado', status?: 'aberto'|'pendente'|'confirmado'|'negado' }
//    > origemMensagem: texto opcional (ex.: 'whatsapp', 'site', 'instagram')
//    > usuario: { id?, nome? }
//
// O arquivo em ./historico/<cliente>_capitulos.json passa a conter:
//  {
//    "capituloAtual": "...",
//    "dataInicio": "...", "dataAtualizado": "...",
//    "tagsRelacionadas": [...],
//    "motivo": "...",
//    "intencao": "agendar|comprar|...",
//    "item": { nome, tipo?, origem?, sinonimo? } | null,
//    "slots": { data, hora, regiao, quantidade, acao },
//    "funil": { etapa, status? },
//    "origemMensagem": "whatsapp|...",
//    "usuario": { id?, nome? },
//    "timeline": [ { ts, tags, slots, intencao, item, nota? } ]
//  }
//
// Observação: se o arquivo antigo existir no formato antigo, fazemos "upgrade" sem quebrar nada.

import fs from 'fs';
import path from 'path';
import { debugLog } from '../Utils/debugLog.js';   // helper central de log

const CAPITULO_DIR = './historico';                // mantém pasta original

function getCapituloPath(nomeArquivoCliente) {
  return path.join(CAPITULO_DIR, `${nomeArquivoCliente}_capitulos.json`);
}

/* ───────── utils ───────── */
// [LUNI-UPD] merge raso + preserva valores existentes quando novo vier nulo/undefined
function mergePreferindoNovos(base = {}, novo = {}) {
  const out = { ...(base || {}) };
  for (const k of Object.keys(novo || {})) {
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
function isPlainObject(o) {
  return o && typeof o === 'object' && !Array.isArray(o);
}
function uniq(arr = []) {
  return Array.from(new Set(arr.filter(Boolean)));
}

/* ───────── garantir diretório ───────── */
function garantirDiretorioCapitulo() {
  if (!fs.existsSync(CAPITULO_DIR)) {
    fs.mkdirSync(CAPITULO_DIR, { recursive: true });
    debugLog('chapterManager > garantirDiretorioCapitulo', { criada: CAPITULO_DIR });
  }
}

/* ───────── carregar ───────── */
export function carregarCapituloAtual(nomeArquivoCliente) {
  const filePath = getCapituloPath(nomeArquivoCliente);
  if (!fs.existsSync(filePath)) {
    debugLog('chapterManager > carregarCapituloAtual', { filePath, status: 'nao_existe' });
    return null;
  }
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    debugLog('chapterManager > carregarCapituloAtual', { filePath, capituloAtual: data.capituloAtual });
    return data;
  } catch (e) {
    console.warn('Erro ao carregar capítulo:', e.message);
    return null;
  }
}

/* ───────── salvar ───────── */
export function salvarCapitulo(nomeArquivoCliente, capituloObj) {
  garantirDiretorioCapitulo();
  const filePath = getCapituloPath(nomeArquivoCliente);
  try {
    fs.writeFileSync(filePath, JSON.stringify(capituloObj, null, 2), 'utf-8');
    debugLog('chapterManager > salvarCapitulo', { filePath, capituloObj });
  } catch (e) {
    console.error('Erro ao salvar capítulo:', e.message);
  }
}

/**
 * Atualiza o capítulo com base nas tags.
 * Ex (legado): ['intencao_agendar', 'pergunta_preco'] → "intencao_agendar_pergunta_preco"
 * Se "motivo" for fornecido, ele será salvo também.
 *
 * [LUNI-UPD] Modo avançado:
 * - O 3º parâmetro pode ser um objeto de opções (ver cabeçalho do arquivo).
 * - Preserva dataInicio do capítulo corrente e atualiza dataAtualizado.
 * - Faz upgrade do arquivo antigo para o novo formato (adiciona slots, funil, timeline).
 * - Une tagsRelacionadas (evita sobrescrever as anteriores).
 */
export function atualizarCapitulo(nomeArquivoCliente, tags = [], motivoOuOpts = '') {
  const agora = new Date().toISOString();

  // Detecta se o 3º parâmetro é objeto de opções avançadas
  const opts = (motivoOuOpts && typeof motivoOuOpts === 'object' && !Array.isArray(motivoOuOpts))
    ? motivoOuOpts
    : { motivo: motivoOuOpts };

  const motivo = opts.motivo ?? '';
  const slots = opts.slots ?? null;
  const intencao = opts.intencao ?? inferirIntencao(tags, slots);
  const item = normalizarItem(opts.item ?? slots?.item ?? null);
  const funil = normalizarFunil(opts.funil);
  const origemMensagem = opts.origemMensagem ?? null;
  const usuario = opts.usuario ?? null;

  // Monta identificador de capítulo (compatível com legado)
  const capituloId = (Array.isArray(tags) && tags.length)
    ? tags.join('_').slice(0, 50)
    : 'conversa_geral';

  // Carrega arquivo existente (pode estar no formato antigo)
  const filePath = getCapituloPath(nomeArquivoCliente);
  const existente = carregarCapituloAtual(nomeArquivoCliente);

  // Base de capítulo (upgrade seguro)
  const baseCap = existente ? upgradeCapitulo(existente) : null;

  const capAtualizado = baseCap
    ? atualizarMantendoHistorico(baseCap, {
        capituloAtual: capituloId,
        tagsRelacionadas: uniq([...(baseCap.tagsRelacionadas || []), ...(tags || [])]),
        motivo,
        intencao,
        item,
        slots,
        funil,
        origemMensagem,
        usuario,
        dataAtualizado: agora
      }, { tags, slots, intencao, item })
    : criarNovoCapitulo({
        capituloAtual: capituloId,
        dataInicio: agora,
        dataAtualizado: agora,
        tagsRelacionadas: uniq(tags || []),
        motivo,
        intencao,
        item,
        slots,
        funil,
        origemMensagem,
        usuario,
        timeline: []
      }, { tags, slots, intencao, item });

  salvarCapitulo(nomeArquivoCliente, capAtualizado);
  debugLog('chapterManager > atualizarCapitulo', { nomeArquivoCliente, novoCapitulo: capAtualizado });
  return capAtualizado;
}

/* ───────── alias semântico (legado) ───────── */
export function iniciarNovoCapitulo(nomeArquivoCliente, motivo = '', tags = []) {
  return atualizarCapitulo(nomeArquivoCliente, tags, motivo);
}

/* ───────── helpers [LUNI-UPD] ───────── */
function inferirIntencao(tags = [], slots = null) {
  const t = new Set(tags || []);
  if (slots?.acao === 'agendar' || t.has('intencao_agendar')) return 'agendar';
  if (slots?.acao === 'comprar' || t.has('intencao_comprar')) return 'comprar';
  if (t.has('pergunta_preco')) return 'informar_preco';
  if (t.has('pergunta_servico')) return 'informar_servico';
  if (t.has('pergunta_disponibilidade')) return 'consultar_disponibilidade';
  return null;
}

function normalizarItem(x) {
  if (!x) return null;
  if (typeof x === 'string') return { nome: x };
  const { nome, tipo, origem, sinonimo } = x;
  if (!nome) return null;
  return { nome, tipo: tipo || undefined, origem: origem || undefined, sinonimo: sinonimo || undefined };
}

function normalizarFunil(f) {
  if (!f) return null;
  const etapaValida = ['descoberta','avaliacao','intencao','confirmacao','finalizado','cancelado'];
  const statusValido = ['aberto','pendente','confirmado','negado'];
  const etapa = etapaValida.includes((f.etapa || '').toLowerCase()) ? f.etapa.toLowerCase() : (f.etapa || undefined);
  const status = statusValido.includes((f.status || '').toLowerCase()) ? f.status.toLowerCase() : (f.status || undefined);
  const out = {};
  if (etapa) out.etapa = etapa;
  if (status) out.status = status;
  return Object.keys(out).length ? out : null;
}

function upgradeCapitulo(old) {
  // Garante chaves do novo modelo e preserva valores antigos
  const upgraded = {
    capituloAtual: old.capituloAtual || 'conversa_geral',
    dataInicio: old.dataInicio || new Date().toISOString(),
    dataAtualizado: old.dataAtualizado || old.dataInicio || new Date().toISOString(),
    tagsRelacionadas: Array.isArray(old.tagsRelacionadas) ? old.tagsRelacionadas : [],
    motivo: old.motivo ?? null,
    intencao: old.intencao ?? null,
    item: old.item ?? null,
    slots: old.slots ?? { data: null, hora: null, regiao: null, quantidade: null, acao: null, item: null },
    funil: old.funil ?? null,
    origemMensagem: old.origemMensagem ?? null,
    usuario: old.usuario ?? null,
    timeline: Array.isArray(old.timeline) ? old.timeline : []
  };
  return upgraded;
}

function criarNovoCapitulo(base, evento) {
  const cap = { ...base };
  anexarEventoTimeline(cap, evento);
  return cap;
}

function atualizarMantendoHistorico(baseCap, novosCampos, evento) {
  const cap = mergePreferindoNovos(baseCap, novosCampos);
  // Se o ID de capítulo mudou, reinicia dataInicio e mantém timeline (continuidade)
  if (baseCap.capituloAtual !== novosCampos.capituloAtual) {
    cap.dataInicio = novosCampos.dataAtualizado || new Date().toISOString();
  }
  anexarEventoTimeline(cap, evento);
  return cap;
}

function anexarEventoTimeline(cap, { tags, slots, intencao, item, nota }) {
  try {
    cap.timeline = Array.isArray(cap.timeline) ? cap.timeline : [];
    cap.timeline.push({
      ts: new Date().toISOString(),
      tags: Array.isArray(tags) ? tags : [],
      slots: slots || null,
      intencao: intencao ?? null,
      item: item ?? null,
      nota: nota || undefined
    });
    // Evita crescer indefinidamente (mantém os últimos 200 eventos)
    if (cap.timeline.length > 200) {
      cap.timeline = cap.timeline.slice(-200);
    }
  } catch (e) {
    console.warn('chapterManager > anexarEventoTimeline erro:', e.message);
  }
}
