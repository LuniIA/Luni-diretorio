// detectorDeFoco.js v3.1 - Detecta produtos, serviços, nome/telefone e sinais de agendamento (dia/hora/região) + logs + detecção de compra
import { debugLog } from '../../Utils/debugLog.js'; // ajuste caminho conforme sua estrutura
import { extrairNome, extrairTelefone, normalizarTexto } from '../../Utils/unified.js';

/* ───────── helpers ───────── */
function normalize(str) {
  return normalizarTexto(str);
}

const DIAS = [
  'domingo','segunda','terca','terça','quarta','quinta','sexta','sabado','sábado'
];

function extrairDia(mensagem) {
  const txt = normalize(mensagem);
  if (/\bhoje\b/.test(txt)) return 'hoje';
  if (/\bamanha\b/.test(txt)) return 'amanhã';
  if (/\bdepois de amanha\b/.test(txt)) return 'depois de amanhã';
  for (const d of DIAS) {
    if (txt.includes(d)) return d;
  }
  return null;
}

function extrairHorario(mensagem) {
  const txt = normalize(mensagem).replace(/\s+/g, ' ');
  const re = /\b([01]?\d|2[0-3])(?:[:h\s]?([0-5]\d))?\s*(?:h|hrs|horas)?\b/;
  const m = txt.match(re);
  if (!m) return null;
  const hh = m[1].padStart(2, '0');
  const mm = (m[2] ? m[2] : '00').padStart(2, '0');
  return `${hh}:${mm}`;
}

function extrairRegiao(mensagem) {
  const txt = normalize(mensagem);
  const re =
    /\b(zona|regiao|região|bairro|centro|norte|sul|leste|oeste)\s*(norte|sul|leste|oeste|centro|[a-zà-ÿ]+)?/i;
  const m = txt.match(re);
  if (!m) return null;
  const p1 = m[1];
  const p2 = m[2] ? m[2] : '';
  return [p1, p2].filter(Boolean).join(' ').trim();
}

function deListaServicos(cliente) {
  const nomes = (cliente.servicosComPrecoFixo || [])
    .map((s) => String(s).split(':')[0]?.trim())
    .filter(Boolean);
  const extras =
    (cliente.produtosServicos || [])
      .filter((p) => normalize(p.tipo || '') === 'servico' || normalize(p.categoria || '') === 'servico')
      .map((p) => p.nome?.trim())
      .filter(Boolean) || [];
  return Array.from(new Set([...nomes, ...extras]));
}

function matchServicosNaMensagem(mensagem, cliente) {
  const msg = normalize(mensagem);
  const servicos = deListaServicos(cliente).map((s) => ({ original: s, norm: normalize(s) }));
  const encontrados = [];
  for (const s of servicos) {
    if (!s.norm) continue;
    if (msg.includes(s.norm)) encontrados.push(s.original);
  }
  return Array.from(new Set(encontrados));
}

/* ───────── detecção principal ───────── */
export function detectarFoco(mensagem, cliente) {
  const focosDetectados = {
    duvidasRecentes: [mensagem],
    intencaoAtual: null
  };

  const msg = normalize(mensagem);
  const dataAgora = new Date().toISOString();
  debugLog('detectorDeFoco > entrada', { mensagem });

  /* Produtos */
  if (Array.isArray(cliente.produtosServicos)) {
    for (const produto of cliente.produtosServicos) {
      const nome = String(produto.nome || '').trim();
      const apelidos = [nome, ...(produto.apelidos || [])]
        .filter(Boolean)
        .map((a) => normalize(a));

      if (nome && apelidos.some((a) => msg.includes(a))) {
        if (!focosDetectados.produto) focosDetectados.produto = [];
        focosDetectados.produto.push({
          nome,
          apelidos: [nome, ...(produto.apelidos || [])],
          tamanhosMencionados: [],
          coresMencionadas: [],
          intencao: 'interesse',
          ultimaMencao: dataAgora
        });
        if (!focosDetectados.intencaoAtual) focosDetectados.intencaoAtual = 'comprar produto';
        debugLog('detectorDeFoco > produto detectado', { produto: nome, apelidos: produto.apelidos || [] });
      }
    }
  }

  /* Serviços */
  const servicosCitados = matchServicosNaMensagem(mensagem, cliente);
  if (servicosCitados.length) {
    if (!focosDetectados.servico) focosDetectados.servico = [];
    for (const nomeServ of servicosCitados) {
      focosDetectados.servico.push({
        nome: nomeServ,
        intencao: 'agendar',
        ultimaMencao: dataAgora
      });
    }
    focosDetectados.intencaoAtual = focosDetectados.intencaoAtual || 'agendar servico';
    debugLog('detectorDeFoco > serviço detectado', { servicos: servicosCitados });
  }

  /* Nome e telefone */
  const nomeExtraido = extrairNome(mensagem);
  if (nomeExtraido) {
    focosDetectados.contatoCliente = { ...(focosDetectados.contatoCliente || {}), nome: nomeExtraido, telefone: null };
    debugLog('detectorDeFoco > nome detectado', { nome: nomeExtraido });
  }
  const telExtraido = extrairTelefone(mensagem);
  if (telExtraido) {
    focosDetectados.contatoCliente = { ...(focosDetectados.contatoCliente || {}), telefone: telExtraido };
    debugLog('detectorDeFoco > telefone detectado', { telefone: telExtraido });
  }

  /* Sinais de agendamento */
  const haVerboAgendar = /(dia|hor[áa]rio|marcar|agendar|quando|dispon[ií]vel|tem vaga|pode ser|agenda|agendo)/i.test(mensagem);
  const diaCitado = extrairDia(mensagem);
  const horarioCitado = extrairHorario(mensagem);
  const regiaoCitada = extrairRegiao(mensagem);

  if (haVerboAgendar || diaCitado || horarioCitado) {
    if (!focosDetectados.agendamento) focosDetectados.agendamento = [];

    const servicoRelacionado =
      (focosDetectados.servico && focosDetectados.servico[0]?.nome) ||
      (Array.isArray(focosDetectados.produto) && focosDetectados.produto.length
        ? focosDetectados.produto[0].nome
        : null);

    focosDetectados.agendamento.push({
      servicoRelacionado: servicoRelacionado || 'N/D',
      data: diaCitado || 'N/D',
      horario: horarioCitado || 'N/D',
      regiao: regiaoCitada || 'N/D',
      confirmado: false,
      ultimaInteracao: dataAgora
    });

    if (!focosDetectados.intencaoAtual) focosDetectados.intencaoAtual = 'intencao de agendamento';
    debugLog('detectorDeFoco > intenção de agendamento detectada', {
      servicoRelacionado: servicoRelacionado || 'N/D',
      data: diaCitado || 'N/D',
      horario: horarioCitado || 'N/D',
      regiao: regiaoCitada || 'N/D'
    });
  }

  /* Item não listado */
  if (!focosDetectados.produto && !focosDetectados.servico && /\b(quero|tem|fazem|voc[eê]s|vcs|vende|oferece)\b/i.test(mensagem)) {
    focosDetectados.itemIndefinido = [
      {
        nomeMencionado: mensagem,
        tipo: 'desconhecido',
        mensagemOriginal: mensagem,
        intencaoProvavel: 'possível interesse',
        ultimaMencao: dataAgora
      }
    ];
    debugLog('detectorDeFoco > item indefinido detectado', { mensagem });
  }

  debugLog('detectorDeFoco > focos finalizados', focosDetectados);
  return focosDetectados;
}

/* ───────── intenções rápidas ───────── */
export function temIntencaoDeAgendamento(msg = '') {
  const t = (msg || '').toLowerCase();
  return /(agendar|marcar|agenda|hor[aá]rio|dispon[ií]vel|quando|pode ser|tem vaga)/i.test(t);
}

export function temIntencaoDeCompra(msg = '') {
  const t = (msg || '').toLowerCase();
  return /(fechar|finalizar|levar|comprar|checkout|pagar|pagamento|pix|cart[aã]o|boleto)/i.test(t);
}
