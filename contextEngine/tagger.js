// tagger.js v1.2 – Detecta intenção da mensagem via regex + LOG de execução
// -------------------------------------------------------------------------
// Mantido: detectarIntencao(mensagem)  -> retorna array de tags (compatível)
// Novo   : detectarIntencaoV2(mensagem, produtosServicos?) -> { tags, slots }
// -------------------------------------------------------------------------

/**
 * Detecta intenções principais com base em padrões de texto simples
 * Retorna uma lista de tags como: ['pergunta_preco', 'intencao_agendar']
 */

function normalizarTexto(texto) {
  return texto
    .toLowerCase()
    .normalize("NFD")               // Remove acentos
    .replace(/[\u0300-\u036f]/g, '');
}

export function detectarIntencao(mensagem) {
  if (!mensagem || typeof mensagem !== 'string') return [];

  const texto = normalizarTexto(mensagem);
  const tags = new Set();

  // 💰 Preço / Valor
  if (/quanto.*(custa|fica|preco)/i.test(texto) || /(qual.*valor|preco.*quanto)/i.test(texto))
    tags.add('pergunta_preco');

  // 📅 Agendamento
  if (/(quero|pode|tem).*agendar/i.test(texto) || /horario|disponivel/i.test(texto))
    tags.add('intencao_agendar');

  // 🗺️ Localização / atendimento por região
  if (/voce.*atende.*(zona|bairro|regiao)/i.test(texto))
    tags.add('pergunta_local');

  // 🧴 Produto ou serviço
  if (/(tem|faz|vende|oferece).*?(produto|servico|limpeza|manutencao|corte|plano|kit)/i.test(texto))
    tags.add('pergunta_servico');

  // ⏱️ Duração / tempo
  if (/quanto.*tempo/i.test(texto) || /demora|leva.*tempo/i.test(texto))
    tags.add('pergunta_duracao');

  // ❓ Dúvida genérica
  if (/nao entendi|pode explicar|como funciona/i.test(texto))
    tags.add('duvida_funcionamento');

  // 🔄 Mudança de assunto
  if (/agora.*quero|mudei de ideia|outro servico/i.test(texto))
    tags.add('mudanca_assunto');

  // ❌ Cancelamento
  if (/cancelar|nao quero mais|desmarcar/i.test(texto))
    tags.add('intencao_cancelar');

  // ✅ Elogio
  if (/obrigado|gostei|perfeito|amei|top/i.test(texto))
    tags.add('elogio');

  // ⚠️ Reclamação
  if (/nao gostei|muito ruim|pessimo|demorado/i.test(texto))
    tags.add('reclamacao');

  // 👉 LOG: sempre imprime a mensagem e as tags detectadas
  console.log('🪵 tagger > detectarIntencao', { mensagem, tags: Array.from(tags) });

  return Array.from(tags);
}

// Exemplo:
// const tags = detectarIntencao("Qual o valor da limpeza? Posso agendar amanhã?");
// -> loga no console e retorna ['pergunta_preco', 'intencao_agendar']



// ========================================================================
// [LUNI-UPD] V2 AVANÇADO: detecção de intenção + extração de SLOTS/ENTIDADES
// ========================================================================

/**
 * [LUNI-UPD] Tipos esperados em produtosServicos (opcional):
 * [
 *   { nome: "Massagem relaxante", apelidos: ["massagem relaxante", "relaxante"], tipo: "servico" },
 *   { nome: "Óleo essencial", apelidos: ["oleo", "oleo essencial"], tipo: "produto" }
 * ]
 */

// [LUNI-UPD] util: pega primeiro match com groups nomeados se existir
function firstMatch(regex, texto) {
  const m = regex.exec(texto);
  if (!m) return null;
  const value = m.groups?.value ?? m[0];
  return { value: value?.trim(), match: m[0], index: m.index, groups: m.groups || {} };
}

// [LUNI-UPD] util: normaliza e compara string com segurança
function includesNorm(haystack, needle) {
  return normalizarTexto(haystack).includes(normalizarTexto(needle));
}

// [LUNI-UPD] Extração de slots (pt-BR)
function extrairSlots(mensagem, produtosServicos = []) {
  const original = mensagem || '';
  const texto = normalizarTexto(original);
  const slots = {
    data: null,     // { tipo: 'relative|weekday|date', texto }
    hora: null,     // { texto }
    regiao: null,   // { tipo: 'bairro|zona|regiao|cidade', texto }
    item: null,     // { nome, origem: 'catalogo|texto', sinonimo? }
    quantidade: null, // { numero }
    acao: null      // 'agendar' | 'comprar' | 'informar'
  };

  // AÇÃO
  if (/(agendar|agenda|marcar|marcacao|agendamento)/i.test(texto)) {
    slots.acao = 'agendar';
  } else if (/(comprar|fechar|quero esse|quero esse mesmo|quero esse aqui|finalizar|fechamos)/i.test(texto)) {
    slots.acao = 'comprar';
  } else if (/(quero|tem|pode|informar)/i.test(texto)) {
    slots.acao = 'informar';
  }

  // HORA (13h, 13:00, 13hrs, 1pm, 1 pm)
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
    const dias = ['segunda','terca','terça','quarta','quinta','sexta','sabado','sábado','domingo'];
    const d = dias.find(dia => new RegExp(`\\b${dia}\\b`, 'i').test(texto));
    if (d) slots.data = { tipo: 'weekday', texto: d.replace('terça','terca').replace('sábado','sabado') };
  }

  // DATA explícita (dd/mm ou dd/mm/aaaa)
  if (!slots.data) {
    const reData = /\b(?<value>(0?[1-9]|[12]\d|3[01])[\/\-\.](0?[1-9]|1[0-2])([\/\-\.](\d{2}|\d{4}))?)\b/;
    const md = firstMatch(reData, texto);
    if (md) slots.data = { tipo: 'date', texto: md.value.replace(/\./g,'/').replace(/-/g,'/') };
  }

  // REGIÃO / BAIRRO / ZONA / CIDADE
  // Ex.: "na zona sul", "no centro", "no bairro tal", "em campinas"
  const reRegiaoPalavraChave = /\b(zona (norte|sul|leste|oeste)|centro|regiao|região|bairro|cidade)\b\s*(de|da|do)?\s*(?<value>[a-z0-9\s\-]+)?/i;
  const rr = firstMatch(reRegiaoPalavraChave, original); // usar original p/ capturar maiúsculas
  if (rr) {
    const tipo = /bairro/i.test(rr.match) ? 'bairro' :
                 /zona/i.test(rr.match) ? 'zona' :
                 /regiao|região/i.test(rr.match) ? 'regiao' :
                 /cidade/i.test(rr.match) ? 'cidade' : 'regiao';
    const nome = (rr.groups?.value || rr.match).toString().trim();
    // Limpa cauda genérica
    const limp = nome.replace(/^(zona (norte|sul|leste|oeste)|bairro|regiao|região|cidade)\s*/i, '').trim();
    slots.regiao = { tipo, texto: limp || nome };
  }

  // QUANTIDADE (ex.: "quero 2 sessões", "3 unidades")
  const reQtd = /\b(?<value>\d{1,3})\s*(unidades?|un|itens?|sess(ao|aoes|ões)|p(ck|acotes?)|pacotes?)\b/i;
  const mq = firstMatch(reQtd, texto);
  if (mq) {
    const num = parseInt(mq.value, 10);
    if (!Number.isNaN(num)) slots.quantidade = { numero: num };
  }

  // ITEM / PRODUTO via catálogo (produtosServicos)
  if (Array.isArray(produtosServicos) && produtosServicos.length) {
    const normMsg = normalizarTexto(original);
    let encontrado = null;

    for (const p of produtosServicos) {
      const candidatos = [p.nome, ...(Array.isArray(p.apelidos) ? p.apelidos : [])].filter(Boolean);
      for (const c of candidatos) {
        if (includesNorm(normMsg, c)) {
          encontrado = { nome: p.nome, origem: 'catalogo', sinonimo: c !== p.nome ? c : undefined, tipo: p.tipo || undefined };
          break;
        }
      }
      if (encontrado) break;
    }
    if (encontrado) slots.item = encontrado;
  }

  // ITEM / PRODUTO por texto genérico (fallback)
  if (!slots.item) {
    // heurística leve para extrair algo após verbos de desejo
    const mWish = /(?:quero|gostaria|prefiro|interesse em|fechar)\s+(?<value>[\w\sçãõáéíóúâêôü\-]{3,})/i.exec(original);
    if (mWish?.groups?.value) {
      slots.item = { nome: mWish.groups.value.trim(), origem: 'texto' };
    }
  }

  return slots;
}

// [LUNI-UPD] enriquecimento de tags com base em slots + regras extras
function etiquetarAvancado(texto, slots) {
  const tags = new Set(detectarIntencao(texto)); // reusa as regras existentes

  // Regras adicionais
  if (slots.acao === 'agendar') tags.add('intencao_agendar');
  if (slots.acao === 'comprar') tags.add('intencao_comprar');

  if (slots.hora || slots.data) tags.add('forneceu_horario');
  if (slots.regiao) tags.add('forneceu_regiao');
  if (slots.item) {
    tags.add('citou_item');
    if ((slots.item.origem === 'catalogo') && (/quero|fechar|comprar|esse mesmo/i.test(texto))) {
      tags.add('intencao_comprar');
    }
  }
  if (/\b(disponivel|disponibilidade|qual horario|que horas|tem horario)\b/i.test(texto)) {
    tags.add('pergunta_disponibilidade');
  }

  return Array.from(tags);
}

/**
 * [LUNI-UPD] Nova API: detectarIntencaoV2
 * - NÃO quebra compatibilidade, pois é export separada.
 * - Retorna { tags, slots } para o ContextEngine gravar o que importa.
 */
export function detectarIntencaoV2(mensagem, produtosServicos = []) {
  if (!mensagem || typeof mensagem !== 'string') {
    const vazio = { tags: [], slots: {} };
    console.log('🪵 tagger > detectarIntencaoV2', vazio);
    return vazio;
  }

  const slots = extrairSlots(mensagem, produtosServicos);
  const tags = etiquetarAvancado(mensagem, slots);

  // Log enriquecido
  console.log('🪵 tagger > detectarIntencaoV2', { mensagem, tags, slots });

  return { tags, slots };
}

// -------------------------------------------------------------------------
// [LUNI-UPD] Auto-check (para debug local opcional — não interfere no app)
// -------------------------------------------------------------------------
// Exemplo rápido (comentado por padrão):
/*
const _ex = detectarIntencaoV2("Quero agendar massagem relaxante quarta 13hrs no centro, pode?", [
  { nome: "Massagem relaxante", apelidos: ["massagem relaxante", "relaxante"], tipo: "servico" },
  { nome: "Massagem terapêutica", apelidos: ["massagem terapeutica", "terapeutica"], tipo: "servico" }
]);
console.log('✅ tagger auto-check:', _ex);
*/
