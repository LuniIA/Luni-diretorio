// core/personalidadeVendedora.js v2.0
// Sistema de Personalidade Vendedora Global - Funciona para qualquer tipo de negócio
// Foco: Criar personalidade consistente e memória emocional universal

import { debugLog } from '../Utils/debugLog.js';
import { createCache, get, set, del, clear, stats } from './cacheManager.js';

// Cache unificado para memória emocional
const memoriaEmocionalCache = createCache('personalidade', { ttlMs: 24 * 60 * 60 * 1000 }); // 24 horas

/**
 * SISTEMA DE PERSONALIDADE DINÂMICA GLOBAL
 * Cria personalidade única baseada no perfil do cliente, mas universal
 */
export function gerarPersonalidadeVendedora(cliente) {
  const intensidadeVendas = cliente.intensidadeVendas || 2;
  const segmento = cliente.segmento || 'geral';
  
  // Personalidade base universal
  const personalidadeBase = {
    estilo: determinarEstilo(intensidadeVendas, segmento),
    humor: determinarHumor(cliente),
    energia: determinarEnergia(intensidadeVendas),
    especialidade: determinarEspecialidade(segmento),
    gatilhosPreferidos: determinarGatilhos(intensidadeVendas, segmento),
    tom: determinarTom(cliente),
    abordagem: determinarAbordagem(intensidadeVendas)
  };

  debugLog('personalidadeVendedora > gerada', {
    cliente: cliente.nomeArquivo,
    estilo: personalidadeBase.estilo,
    energia: personalidadeBase.energia
  });

  return personalidadeBase;
}

/**
 * Determina o estilo baseado na intensidade e segmento
 */
function determinarEstilo(intensidadeVendas, segmento) {
  const estilos = {
    1: 'informativo',
    2: 'consultivo', 
    3: 'ativo'
  };

  // Ajustes por segmento (mantendo universalidade)
  const ajustesSegmento = {
    'estetica_emocional': 'empatico',
    'servicos_tecnologicos': 'especialista',
    'ecommerce_ativo': 'persuasivo',
    'barbearia': 'descontraido',
    'bemestar-massoterapia': 'acolhedor'
  };

  const estiloBase = estilos[intensidadeVendas] || 'consultivo';
  const ajuste = ajustesSegmento[segmento];
  
  return ajuste || estiloBase;
}

/**
 * Determina o humor baseado no perfil do cliente
 */
function determinarHumor(cliente) {
  const emojis = cliente.emojis;
  const linguagem = cliente.linguagem;
  
  if (emojis === "Sim") {
    return "leve";
  } else if (linguagem && linguagem.includes("técnica")) {
    return "neutro";
  } else if (linguagem && linguagem.includes("formal")) {
    return "serio";
  }
  
  return "leve"; // padrão universal
}

/**
 * Determina energia baseada na intensidade
 */
function determinarEnergia(intensidadeVendas) {
  const energias = {
    1: "baixa",
    2: "media", 
    3: "alta"
  };
  
  return energias[intensidadeVendas] || "media";
}

/**
 * Determina especialidade baseada no segmento
 */
function determinarEspecialidade(segmento) {
  const especialidades = {
    'estetica_emocional': 'relacionamento',
    'servicos_tecnologicos': 'tecnologia',
    'ecommerce_ativo': 'produto',
    'barbearia': 'servico',
    'bemestar-massoterapia': 'bemestar',
    'moda_feminina': 'produto',
    'servicos_gerais': 'solucao'
  };
  
  return especialidades[segmento] || 'solucao';
}

/**
 * Determina gatilhos preferidos baseados na intensidade e segmento
 */
function determinarGatilhos(intensidadeVendas, segmento) {
  const gatilhosBase = {
    1: ['autoridade', 'seguranca'],
    2: ['prova_social', 'reciprocidade', 'autoridade'],
    3: ['urgencia', 'escassez', 'prova_social', 'exclusividade']
  };

  const gatilhosSegmento = {
    'estetica_emocional': ['exclusividade', 'bemestar'],
    'servicos_tecnologicos': ['autoridade', 'seguranca'],
    'ecommerce_ativo': ['urgencia', 'escassez', 'prova_social'],
    'barbearia': ['conveniencia', 'prova_social'],
    'bemestar-massoterapia': ['bemestar', 'exclusividade']
  };

  const base = gatilhosBase[intensidadeVendas] || gatilhosBase[2];
  const segmentoEspecifico = gatilhosSegmento[segmento] || [];
  
  return [...new Set([...base, ...segmentoEspecifico])];
}

/**
 * Determina tom baseado no perfil
 */
function determinarTom(cliente) {
  const linguagem = cliente.linguagem;
  const emojis = cliente.emojis;
  
  if (linguagem && linguagem.includes("técnica")) {
    return "profissional";
  } else if (linguagem && linguagem.includes("formal")) {
    return "formal";
  } else if (emojis === "Sim") {
    return "amigavel";
  }
  
  return "natural"; // padrão universal
}

/**
 * Determina abordagem baseada na intensidade
 */
function determinarAbordagem(intensidadeVendas) {
  const abordagens = {
    1: "educativa",
    2: "consultiva",
    3: "persuasiva"
  };
  
  return abordagens[intensidadeVendas] || "consultiva";
}

/**
 * SISTEMA DE MEMÓRIA EMOCIONAL GLOBAL
 * Rastreia estado emocional do cliente de forma universal
 */
export function atualizarMemoriaEmocional(cliente, mensagem, resposta, meta = {}) {
  const cacheKey = cliente.nomeArquivo;
  const agora = Date.now();
  
  // Carregar memória existente ou criar nova
  let memoria = get('personalidade', cacheKey, cliente.nomeArquivo) || {
    confianca: 0.5,
    urgencia: 0.3,
    objeções: [],
    gatilhosFuncionaram: [],
    interesses: [],
    ultimaAtualizacao: agora
  };

  // Analisar mensagem para detectar estado emocional
  const analiseEmocional = analisarEstadoEmocional(mensagem);
  memoria.confianca = Math.max(0, Math.min(1, memoria.confianca + analiseEmocional.confianca));
  memoria.urgencia = Math.max(0, Math.min(1, memoria.urgencia + analiseEmocional.urgencia));
  
  // Adicionar objeções detectadas
  if (analiseEmocional.objeções.length > 0) {
    memoria.objeções = [...new Set([...memoria.objeções, ...analiseEmocional.objeções])];
  }
  
  // Adicionar interesses detectados
  if (analiseEmocional.interesses.length > 0) {
    memoria.interesses = [...new Set([...memoria.interesses, ...analiseEmocional.interesses])];
  }
  
  // Detectar se gatilhos funcionaram (baseado na resposta)
  const gatilhosAplicados = detectarGatilhosAplicados(resposta);
  if (gatilhosAplicados.length > 0) {
    memoria.gatilhosFuncionaram = [...new Set([...memoria.gatilhosFuncionaram, ...gatilhosAplicados])];
  }
  
  memoria.ultimaAtualizacao = agora;
  
  // Salvar no cache
  set('personalidade', cacheKey, memoria, cliente.nomeArquivo);
  
  debugLog('personalidadeVendedora > memoria atualizada', {
    cliente: cliente.nomeArquivo,
    confianca: memoria.confianca,
    objeções: memoria.objeções.length
  });
  
  return memoria;
}

/**
 * Analisa estado emocional da mensagem (versão simplificada)
 */
function analisarEstadoEmocional(mensagem) {
  const mensagemLower = mensagem.toLowerCase();
  
  const analise = {
    confianca: 0,
    urgencia: 0,
    objeções: [],
    interesses: []
  };
  
  // Detectar urgência
  if (mensagemLower.includes('urgente') || mensagemLower.includes('agora') || mensagemLower.includes('hoje')) {
    analise.urgencia = 0.4;
  } else if (mensagemLower.includes('amanhã') || mensagemLower.includes('semana')) {
    analise.urgencia = 0.2;
  }
  
  // Detectar objeções
  const objeções = ['caro', 'difícil', 'complicado', 'não sei', 'dúvida', 'pensando', 'talvez', 'depois'];
  objeções.forEach(objeção => {
    if (mensagemLower.includes(objeção)) {
      analise.objeções.push(objeção);
      analise.confianca -= 0.1;
    }
  });
  
  // Detectar interesses
  const interesses = ['quero', 'gostaria', 'interessante', 'legal', 'bom', 'ótimo'];
  interesses.forEach(interesse => {
    if (mensagemLower.includes(interesse)) {
      analise.interesses.push(interesse);
      analise.confianca += 0.1;
    }
  });
  
  return analise;
}

/**
 * Detecta gatilhos aplicados na resposta
 */
function detectarGatilhosAplicados(resposta) {
  const respostaLower = resposta.toLowerCase();
  const gatilhos = [];
  
  const gatilhosDetectados = {
    urgencia: ['urgente', 'agora', 'últimas', 'esgotando'],
    escassez: ['últimas', 'poucas', 'limitado', 'exclusivo'],
    prova_social: ['clientes', 'recomendam', 'escolhem', 'confiam'],
    autoridade: ['especialista', 'certificado', 'experiência', 'profissional'],
    exclusividade: ['exclusivo', 'único', 'especial', 'personalizado']
  };
  
  Object.entries(gatilhosDetectados).forEach(([gatilho, palavras]) => {
    if (palavras.some(palavra => respostaLower.includes(palavra))) {
      gatilhos.push(gatilho);
    }
  });
  
  return gatilhos;
}



/**
 * Obtém memória emocional atual
 */
export function obterMemoriaEmocional(cliente) {
  return get('personalidade', cliente.nomeArquivo, cliente.nomeArquivo) || {
    confianca: 0.5,
    urgencia: 0.3,
    objeções: [],
    gatilhosFuncionaram: [],
    interesses: [],
    ultimaAtualizacao: Date.now()
  };
}

/**
 * APLICA PERSONALIDADE À RESPOSTA
 * Adapta a resposta baseada na personalidade e memória emocional
 */
export function aplicarPersonalidadeResposta(resposta, cliente, memoriaEmocional) {
  let respostaAdaptada = resposta;
  const personalidade = gerarPersonalidadeVendedora(cliente);
  
  // 1. Adaptar tom baseado na personalidade
  respostaAdaptada = adaptarTom(respostaAdaptada, personalidade, memoriaEmocional);
  
  // 2. Adicionar emojis se apropriado
  if (cliente.emojis === "Sim") {
    respostaAdaptada = adicionarEmojisContextuais(respostaAdaptada, personalidade, memoriaEmocional);
  }
  
  // 3. Adaptar linguagem baseada no humor
  respostaAdaptada = adaptarLinguagem(respostaAdaptada, memoriaEmocional);
  
  // 4. Adicionar elementos de personalidade
  respostaAdaptada = adicionarElementosPersonalidade(respostaAdaptada, personalidade, memoriaEmocional);
  
  debugLog('personalidadeVendedora > resposta adaptada', {
    cliente: cliente.nomeArquivo,
    original: resposta.length,
    adaptada: respostaAdaptada.length,
    personalidade: personalidade.estilo
  });
  
  return respostaAdaptada;
}

/**
 * Adapta o tom da resposta baseado no perfil do cliente
 */
function adaptarTom(resposta, personalidade, memoriaEmocional) {
  let respostaAdaptada = resposta;
  
  // Adaptar baseado na confiança
  if (memoriaEmocional.confianca < 0.3) {
    // Adicionar elementos de confiança
    if (!respostaAdaptada.includes('garantia') && !respostaAdaptada.includes('segurança')) {
      respostaAdaptada += '\n\nPode confiar, estamos aqui para te ajudar!';
    }
  }
  
  return respostaAdaptada;
}

/**
 * Adiciona emojis contextuais
 */
function adicionarEmojisContextuais(resposta, personalidade, memoriaEmocional) {
  let respostaAdaptada = resposta;
  
  const emojisPorHumor = {
    feliz: ['😊', '✨', '🎉'],
    preocupado: ['😌', '🤗', '💪'],
    irritado: ['😔', '🤝', '💙'],
    triste: ['😊', '💖', '✨'],
    neutro: ['😊', '👍', '✨']
  };
  
  const emojisPorEnergia = {
    alta: ['🔥', '⚡', '💪'],
    media: ['😊', '✨', '👍'],
    baixa: ['😌', '🤗', '💙']
  };
  
  const humor = memoriaEmocional.humor;
  const energia = personalidade.energia;
  
  const emojisHumor = emojisPorHumor[humor] || emojisPorHumor.neutro;
  const emojisEnergia = emojisPorEnergia[energia] || emojisPorEnergia.media;
  
  // Escolher emoji apropriado
  const emojiEscolhido = emojisHumor[Math.floor(Math.random() * emojisHumor.length)];
  
  // Adicionar no final se não houver emoji
  if (!respostaAdaptada.match(/[😊😄😃😀🎯🔥⚡📅💪✨🎉🤗💙💖🤝😌]/)) {
    respostaAdaptada = respostaAdaptada.replace(/([.!?])\s*$/, ` ${emojiEscolhido}$1`);
  }
  
  return respostaAdaptada;
}

/**
 * Adapta linguagem baseada na memória emocional
 */
function adaptarLinguagem(resposta, memoriaEmocional) {
  let respostaAdaptada = resposta;
  
  // Se cliente tem baixa confiança, usar linguagem mais suave
  if (memoriaEmocional.confianca < 0.4) {
    respostaAdaptada = respostaAdaptada
      .replace(/\b(obrigado|preciso|devo)\b/gi, 'gostaria')
      .replace(/\b(urgente|agora)\b/gi, 'quando puder')
      .replace(/\b(caro|difícil)\b/gi, 'investimento');
  }
  
  // Se cliente tem objeções, ser mais empático
  if (memoriaEmocional.objeções.length > 0) {
    if (!respostaAdaptada.includes('entendo') && !respostaAdaptada.includes('compreendo')) {
      respostaAdaptada = respostaAdaptada.replace(/([.!?])\s*$/, ', entendo sua preocupação$1');
    }
  }
  
  return respostaAdaptada;
}

/**
 * Adiciona elementos de personalidade
 */
function adicionarElementosPersonalidade(resposta, personalidade, memoriaEmocional) {
  let respostaAdaptada = resposta;
  
  // Adicionar elementos baseados na especialidade
  const elementosEspecialidade = {
    'relacionamento': ['pessoalmente', 'cuidado especial', 'atenção individual'],
    'tecnologia': ['solução técnica', 'especialista', 'tecnologia avançada'],
    'produto': ['produto ideal', 'melhor opção', 'qualidade superior'],
    'servico': ['atendimento personalizado', 'serviço completo', 'experiência única'],
    'bemestar': ['bem-estar', 'cuidado especial', 'momento relaxante'],
    'solucao': ['solução ideal', 'resposta completa', 'atendimento eficiente']
  };
  
  const elementos = elementosEspecialidade[personalidade.especialidade] || elementosEspecialidade.solucao;
  
  // Adicionar elemento se apropriado e não presente
  if (!respostaAdaptada.includes(elementos[0])) {
    const elementoEscolhido = elementos[Math.floor(Math.random() * elementos.length)];
    respostaAdaptada = respostaAdaptada.replace(/([.!?])\s*$/, `, com ${elementoEscolhido}$1`);
  }
  
  return respostaAdaptada;
}
