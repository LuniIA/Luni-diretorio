// Utils/unified.js v1.0
// Utilitários unificados da Luni - Consolidação de funções duplicadas
// Centraliza: detectarLink, parseDataHora, normalizarTexto, regex patterns, extrações

// ============================================================================
// REGEX PATTERNS CENTRALIZADOS
// ============================================================================

export const REGEX_PATTERNS = {
  // Links
  LINK: /(https?:\/\/[^\s]+)|([^\s]+\.(com|net|org|shop|store|br)(\/\S*)?)/i,
  LINK_SIMPLE: /(https?:\/\/[^\s]+)/g,
  
  // Datas e horários
  DATA_EXPLICITA: /\d{1,2}\/\d{1,2}(\/\d{4})?/,
  DATA_DIA: /dia\s(\d{1,2})/i,
  HORA_BASICA: /(\d{1,2})([:h])?(\d{2})?/i,
  HORA_AMPM: /(1[0-2]|0?[1-9])\s?(am|pm)/i,
  HORA_COMPLETA: /\b(?<value>([01]?\d|2[0-3])[:h\.]?\s?([0-5]\d)?\s?(h|hrs|horas)?\b|\b(1[0-2]|0?[1-9])\s?(am|pm)\b)/i,
  
  // Telefone
  TELEFONE: /(\+55\s?)?(\(?\d{2}\)?\s?)?(\d{4,5}[-\s]?\d{4})/,
  
  // Nome
  NOME: /\b(meu nome é|sou o|sou a|chamo-me|me chamo)\s+([a-zA-ZÀ-ÿ\s]{2,30})\b/i,
  
  // Agendamento
  AGENDAMENTO_FORTE: /(quero agendar|posso marcar|quero marcar|pode agendar|confirma pra mim|me encaixa)/i,
  AGENDAMENTO_LEVE: /(tem horário|disponível|funciona hoje|faz hoje|posso ir)/i,
  
  // Compra
  COMPRA: /(fechar|finalizar|levar|comprar|checkout|pagar|pagamento|pix|cart[aã]o|boleto)/i
};

// ============================================================================
// CONSTANTES CENTRALIZADAS
// ============================================================================

export const DIAS_SEMANA = {
  domingo: 0,
  segunda: 1,
  terça: 2,
  terca: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sábado: 6,
  sabado: 6
};

export const DIAS_ARRAY = ['domingo', 'segunda', 'terça', 'terca', 'quarta', 'quinta', 'sexta', 'sábado', 'sabado'];

export const REGIAO_HINTS = ['zona', 'bairro', 'regiao', 'região', 'centro', 'norte', 'sul', 'leste', 'oeste'];

export const ITEM_HINTS = [
  'massagem relaxante', 'massagem terapeutica', 'massagem terapêutica', 'massagem',
  'limpeza', 'manutencao', 'manutenção', 'corte', 'plano', 'kit', 'servico', 'serviço', 'produto'
];

// ============================================================================
// FUNÇÕES DE NORMALIZAÇÃO
// ============================================================================

export function normalizarTexto(texto) {
  if (!texto || typeof texto !== 'string') return '';
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export const norm = normalizarTexto;

// ============================================================================
// FUNÇÕES DE DETECÇÃO
// ============================================================================

export function detectarLink(mensagem, strict = false) {
  if (!mensagem || typeof mensagem !== 'string') return false;
  const regex = strict ? REGEX_PATTERNS.LINK_SIMPLE : REGEX_PATTERNS.LINK;
  return regex.test(mensagem);
}

export function temIntencaoDeAgendamento(mensagem, respostaIA = '') {
  const forteDetectado = REGEX_PATTERNS.AGENDAMENTO_FORTE.test(mensagem);
  const leveDetectado = REGEX_PATTERNS.AGENDAMENTO_LEVE.test(mensagem);
  
  if (forteDetectado) return true;
  
  if (leveDetectado && /quer que eu agende|posso marcar|quer reservar/i.test(respostaIA)) {
    return true;
  }
  
  return false;
}

export function temLinkDeAgendamento(cliente) {
  return (
    cliente.tipoAgendamento === 'linkInteligente' &&
    typeof cliente.linkAgendamentoInteligente === 'string' &&
    cliente.linkAgendamentoInteligente.startsWith('http')
  );
}

// ============================================================================
// FUNÇÕES DE PARSE
// ============================================================================

export function parseDataHora(mensagem) {
  const hoje = new Date();
  let data = new Date();
  let hora = null;

  // Reconhece "amanhã"
  if (/amanh[ãa]/i.test(mensagem)) {
    data.setDate(data.getDate() + 1);
  }
  // Reconhece "dia 12"
  else if (REGEX_PATTERNS.DATA_DIA.test(mensagem)) {
    const dia = parseInt(mensagem.match(REGEX_PATTERNS.DATA_DIA)[1]);
    const mes = hoje.getMonth();
    let tempData = new Date(hoje.getFullYear(), mes, dia);
    if (tempData < hoje) tempData.setMonth(mes + 1);
    data = tempData;
  }
  // Reconhece "24/05" ou "24/05/2025"
  else if (REGEX_PATTERNS.DATA_EXPLICITA.test(mensagem)) {
    const match = mensagem.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/);
    const dia = parseInt(match[1]);
    const mes = parseInt(match[2]) - 1;
    const ano = match[3] ? parseInt(match[3]) : hoje.getFullYear();
    data = new Date(ano, mes, dia);
  }
  // Reconhece dias da semana
  else {
    for (const [nome, numero] of Object.entries(DIAS_SEMANA)) {
      const regex = new RegExp(nome, 'i');
      if (regex.test(mensagem)) {
        const diaSemanaAtual = hoje.getDay();
        const delta = (numero - diaSemanaAtual + 7) % 7 || 7;
        data.setDate(hoje.getDate() + delta);
        break;
      }
    }
  }

  // Reconhece horas
  const matchHora = mensagem.match(REGEX_PATTERNS.HORA_BASICA);
  if (matchHora) {
    let h = parseInt(matchHora[1]);
    let m = matchHora[3] ? parseInt(matchHora[3]) : 0;

    if (/da\s+manh[ãa]/i.test(mensagem) && h < 12) {
      // já está certo
    } else if (/da\s+noite/i.test(mensagem) || /da\s+tarde/i.test(mensagem)) {
      if (h < 12) h += 12;
    } else if (/depois das (\d{1,2})/i.test(mensagem)) {
      const depoisH = parseInt(mensagem.match(/depois das (\d{1,2})/i)[1]);
      if (!isNaN(depoisH)) h = depoisH + 1;
    }

    hora = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  return {
    data: data.toISOString().split('T')[0],
    hora: hora || null
  };
}

export function detectarPeriodoDia() {
  const hora = new Date().getHours();
  if (hora >= 5 && hora < 12) return "manhã";
  if (hora >= 12 && hora < 18) return "tarde";
  return "noite";
}

// ============================================================================
// FUNÇÕES DE EXTRAÇÃO
// ============================================================================

export function extrairSlots(mensagem, produtosServicos = []) {
  const texto = normalizarTexto(mensagem);
  const slots = {
    data: null,
    hora: null,
    regiao: null,
    item: null,
    quantidade: null,
    acao: null
  };

  // AÇÃO
  if (/(agendar|agenda|marcar|marcacao|agendamento)/i.test(texto)) {
    slots.acao = 'agendar';
  } else if (/(comprar|fechar|quero esse|finalizar|fechamos)/i.test(texto)) {
    slots.acao = 'comprar';
  } else if (/(quero|tem|pode|informar)/i.test(texto)) {
    slots.acao = 'informar';
  }

  // HORA
  const reHora = /\b(?<value>([01]?\d|2[0-3])[:h\.]?\s?([0-5]\d)?\s?(h|hrs|horas)?\b|\b(1[0-2]|0?[1-9])\s?(am|pm)\b)/i;
  const mh = firstMatch(reHora, texto);
  if (mh) slots.hora = { texto: mh.value.replace(/\s+/g, '') };

  // DATA relativa
  if (/\bhoje\b/.test(texto)) {
    slots.data = { tipo: 'relative', texto: 'hoje' };
  } else if (/\bamanha\b/.test(texto)) {
    slots.data = { tipo: 'relative', texto: 'amanha' };
  } else if (/depois de amanha/.test(texto)) {
    slots.data = { tipo: 'relative', texto: 'depois de amanha' };
  }

  // DIA DA SEMANA
  if (!slots.data) {
    const d = DIAS_ARRAY.find(dia => new RegExp(`\\b${dia}\\b`, 'i').test(texto));
    if (d) slots.data = { tipo: 'weekday', texto: d.replace('terça','terca').replace('sábado','sabado') };
  }

  // REGIÃO
  for (const hint of REGIAO_HINTS) {
    const r = new RegExp(`\\b${hint}\\s+(?:de\\s+)?([\\w\\-çãõéíáâêôú]+)`, 'i').exec(texto);
    if (r && r[1]) { 
      slots.regiao = `${hint} ${r[1]}`; 
      break; 
    }
  }

  // QUANTIDADE
  const reQtd = /\b(?<value>\d{1,3})\s*(unidades?|un|itens?|sess(ao|aoes|ões)|p(ck|acotes?)|pacotes?)\b/i;
  const mq = firstMatch(reQtd, texto);
  if (mq) {
    const num = parseInt(mq.value, 10);
    if (!Number.isNaN(num)) slots.quantidade = { numero: num };
  }

  // ITEM via catálogo
  if (Array.isArray(produtosServicos) && produtosServicos.length) {
    let encontrado = null;
    for (const p of produtosServicos) {
      const candidatos = [p.nome, ...(Array.isArray(p.apelidos) ? p.apelidos : [])].filter(Boolean);
      for (const c of candidatos) {
        if (includesNorm(texto, c)) {
          encontrado = { nome: p.nome, origem: 'catalogo', sinonimo: c !== p.nome ? c : undefined, tipo: p.tipo || undefined };
          break;
        }
      }
      if (encontrado) break;
    }
    if (encontrado) slots.item = encontrado;
  }

  // ITEM por texto genérico
  if (!slots.item) {
    const mWish = /(?:quero|gostaria|prefiro|interesse em|fechar)\s+(?<value>[\w\sçãõáéíóúâêôü\-]{3,})/i.exec(mensagem);
    if (mWish?.groups?.value) {
      slots.item = { nome: mWish.groups.value.trim(), origem: 'texto' };
    }
  }

  return slots;
}

export function extrairTelefone(mensagem) {
  const match = mensagem.match(REGEX_PATTERNS.TELEFONE);
  return match ? match[0] : null;
}

export function extrairNome(mensagem) {
  const match = mensagem.match(REGEX_PATTERNS.NOME);
  return match ? match[2].trim() : null;
}

// ============================================================================
// FUNÇÕES UTILITÁRIAS
// ============================================================================

export function escolhaAleatoria(lista) {
  if (!Array.isArray(lista) || lista.length === 0) return null;
  const i = Math.floor(Math.random() * lista.length);
  return lista[i];
}

export function includesNorm(haystack, needle) {
  return normalizarTexto(haystack).includes(normalizarTexto(needle));
}

export function firstMatch(regex, texto) {
  const m = regex.exec(texto);
  if (!m) return null;
  const value = m.groups?.value ?? m[0];
  return { value: value?.trim(), match: m[0], index: m.index, groups: m.groups || {} };
}