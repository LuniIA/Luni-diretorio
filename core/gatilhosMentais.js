// core/gatilhosMentais.js v2.0
// Sistema de Gatilhos Mentais Avançados Global - Funciona para qualquer tipo de negócio
// Foco: Técnicas avançadas de persuasão comercial para aumentar conversões

import { debugLog } from '../Utils/debugLog.js';
import { createCache, get, set, del, clear, stats } from './cacheManager.js';

// Cache unificado para histórico de gatilhos aplicados
const gatilhosCache = createCache('gatilhos', { ttlMs: 24 * 60 * 60 * 1000 }); // 24 horas

/**
 * SISTEMA DE GATILHOS MENTAIS AVANÇADOS GLOBAL
 * Aplica técnicas sofisticadas de persuasão baseadas no contexto
 */
export function aplicarGatilhosMentais(resposta, cliente, contexto = {}) {
  let respostaComGatilhos = resposta;
  const personalidade = contexto.personalidade || {};
  const memoriaEmocional = contexto.memoriaEmocional || {};
  const estadoFunil = contexto.estadoFunil || {};
  
  // 1. Detectar gatilhos mais apropriados para o contexto
  const gatilhosAplicaveis = detectarGatilhosAplicaveis(cliente, contexto);
  
  // 2. Aplicar gatilhos de forma natural e contextual
  respostaComGatilhos = aplicarGatilhosContextuais(respostaComGatilhos, gatilhosAplicaveis, contexto);
  
  // 3. Adicionar elementos de urgência e escassez se apropriado
  respostaComGatilhos = adicionarUrgenciaEscassez(respostaComGatilhos, cliente, contexto);
  
  // 4. Aplicar prova social e autoridade
  respostaComGatilhos = aplicarProvaSocialAutoridade(respostaComGatilhos, cliente, contexto);
  
  // 5. Adicionar reciprocidade e compromisso
  respostaComGatilhos = aplicarReciprocidadeCompromisso(respostaComGatilhos, cliente, contexto);
  
  // 6. Registrar gatilhos aplicados
  registrarGatilhosAplicados(cliente, gatilhosAplicaveis);
  
  debugLog('gatilhosMentais > aplicados', {
    cliente: cliente.nomeArquivo,
    gatilhos: gatilhosAplicaveis.map(g => g.tipo),
    original: resposta.length,
    comGatilhos: respostaComGatilhos.length
  });
  
  return respostaComGatilhos;
}

/**
 * Detecta quais gatilhos são mais apropriados para o contexto atual
 */
function detectarGatilhosAplicaveis(cliente, contexto) {
  const gatilhos = [];
  const intensidadeVendas = cliente.intensidadeVendas || 2;
  const segmento = cliente.segmento || 'geral';
  const memoriaEmocional = contexto.memoriaEmocional || {};
  const estadoFunil = contexto.estadoFunil || {};
  
  // Gatilhos baseados na intensidade de vendas
  if (intensidadeVendas >= 3) {
    gatilhos.push(
      { tipo: 'urgencia', intensidade: 0.8, prioridade: 'alta' },
      { tipo: 'escassez', intensidade: 0.7, prioridade: 'alta' },
      { tipo: 'exclusividade', intensidade: 0.6, prioridade: 'media' }
    );
  } else if (intensidadeVendas >= 2) {
    gatilhos.push(
      { tipo: 'prova_social', intensidade: 0.7, prioridade: 'alta' },
      { tipo: 'autoridade', intensidade: 0.6, prioridade: 'media' },
      { tipo: 'reciprocidade', intensidade: 0.5, prioridade: 'media' }
    );
  } else {
    gatilhos.push(
      { tipo: 'seguranca', intensidade: 0.8, prioridade: 'alta' },
      { tipo: 'autoridade', intensidade: 0.7, prioridade: 'alta' },
      { tipo: 'prova_social', intensidade: 0.5, prioridade: 'media' }
    );
  }
  
  // Gatilhos baseados no segmento
  const gatilhosSegmento = {
    'estetica_emocional': [
      { tipo: 'exclusividade', intensidade: 0.8, prioridade: 'alta' },
      { tipo: 'bemestar', intensidade: 0.7, prioridade: 'alta' }
    ],
    'servicos_tecnologicos': [
      { tipo: 'autoridade', intensidade: 0.9, prioridade: 'alta' },
      { tipo: 'seguranca', intensidade: 0.8, prioridade: 'alta' }
    ],
    'ecommerce_ativo': [
      { tipo: 'urgencia', intensidade: 0.8, prioridade: 'alta' },
      { tipo: 'escassez', intensidade: 0.7, prioridade: 'alta' }
    ],
    'barbearia': [
      { tipo: 'conveniencia', intensidade: 0.7, prioridade: 'media' },
      { tipo: 'prova_social', intensidade: 0.6, prioridade: 'media' }
    ],
    'bemestar-massoterapia': [
      { tipo: 'bemestar', intensidade: 0.8, prioridade: 'alta' },
      { tipo: 'exclusividade', intensidade: 0.6, prioridade: 'media' }
    ]
  };
  
  const gatilhosEspecificos = gatilhosSegmento[segmento] || [];
  gatilhos.push(...gatilhosEspecificos);
  
  // Gatilhos baseados no estado emocional
  if (memoriaEmocional.confianca < 0.4) {
    gatilhos.push({ tipo: 'seguranca', intensidade: 0.9, prioridade: 'alta' });
  }
  
  if (memoriaEmocional.urgencia > 0.7) {
    gatilhos.push({ tipo: 'urgencia', intensidade: 0.8, prioridade: 'alta' });
  }
  
  if (memoriaEmocional.objeções && memoriaEmocional.objeções.length > 0) {
    gatilhos.push({ tipo: 'prova_social', intensidade: 0.8, prioridade: 'alta' });
  }
  
  // Gatilhos baseados no funil de vendas
  if (estadoFunil.etapaAtual === 'interesse') {
    gatilhos.push({ tipo: 'prova_social', intensidade: 0.7, prioridade: 'alta' });
  }
  
  if (estadoFunil.etapaAtual === 'desejo') {
    gatilhos.push({ tipo: 'exclusividade', intensidade: 0.7, prioridade: 'alta' });
  }
  
  if (estadoFunil.etapaAtual === 'acao') {
    gatilhos.push({ tipo: 'urgencia', intensidade: 0.8, prioridade: 'alta' });
  }
  
  // Remover duplicatas e ordenar por prioridade
  const gatilhosUnicos = [];
  const tiposAplicados = new Set();
  
  gatilhos
    .sort((a, b) => {
      const prioridades = { 'alta': 3, 'media': 2, 'baixa': 1 };
      return prioridades[b.prioridade] - prioridades[a.prioridade];
    })
    .forEach(gatilho => {
      if (!tiposAplicados.has(gatilho.tipo)) {
        tiposAplicados.add(gatilho.tipo);
        gatilhosUnicos.push(gatilho);
      }
    });
  
  return gatilhosUnicos.slice(0, 3); // Máximo 3 gatilhos por resposta
}

/**
 * Aplica gatilhos de forma contextual e natural
 */
function aplicarGatilhosContextuais(resposta, gatilhos, contexto) {
  let respostaAdaptada = resposta;
  
  gatilhos.forEach(gatilho => {
    switch (gatilho.tipo) {
      case 'urgencia':
        respostaAdaptada = aplicarUrgencia(respostaAdaptada, gatilho.intensidade);
        break;
      case 'escassez':
        respostaAdaptada = aplicarEscassez(respostaAdaptada, gatilho.intensidade);
        break;
      case 'exclusividade':
        respostaAdaptada = aplicarExclusividade(respostaAdaptada, gatilho.intensidade);
        break;
      case 'prova_social':
        respostaAdaptada = aplicarProvaSocial(respostaAdaptada, gatilho.intensidade);
        break;
      case 'autoridade':
        respostaAdaptada = aplicarAutoridade(respostaAdaptada, gatilho.intensidade);
        break;
      case 'seguranca':
        respostaAdaptada = aplicarSeguranca(respostaAdaptada, gatilho.intensidade);
        break;
      case 'bemestar':
        respostaAdaptada = aplicarBemestar(respostaAdaptada, gatilho.intensidade);
        break;
      case 'conveniencia':
        respostaAdaptada = aplicarConveniencia(respostaAdaptada, gatilho.intensidade);
        break;
    }
  });
  
  return respostaAdaptada;
}

/**
 * Aplica gatilho de urgência
 */
function aplicarUrgencia(resposta, intensidade) {
  if (intensidade < 0.5) return resposta;
  
  const frasesUrgencia = [
    'Aproveite agora!',
    'Não perca essa oportunidade!',
    'Agende já!',
    'Corra e garanta seu horário!',
    'Últimas vagas disponíveis!'
  ];
  
  if (!resposta.includes('agora') && !resposta.includes('já') && !resposta.includes('urgente')) {
    const fraseEscolhida = frasesUrgencia[Math.floor(Math.random() * frasesUrgencia.length)];
    return resposta.replace(/([.!?])\s*$/, ` ${fraseEscolhida}$1`);
  }
  
  return resposta;
}

/**
 * Aplica gatilho de escassez
 */
function aplicarEscassez(resposta, intensidade) {
  if (intensidade < 0.5) return resposta;
  
  const frasesEscassez = [
    'Poucas vagas restantes!',
    'Oferta limitada!',
    'Últimas unidades!',
    'Quantidade restrita!',
    'Exclusivo para poucos!'
  ];
  
  if (!resposta.includes('limitado') && !resposta.includes('poucas') && !resposta.includes('últimas')) {
    const fraseEscolhida = frasesEscassez[Math.floor(Math.random() * frasesEscassez.length)];
    return resposta.replace(/([.!?])\s*$/, ` ${fraseEscolhida}$1`);
  }
  
  return resposta;
}

/**
 * Aplica gatilho de exclusividade
 */
function aplicarExclusividade(resposta, intensidade) {
  if (intensidade < 0.5) return resposta;
  
  const frasesExclusividade = [
    'Tratamento exclusivo!',
    'Atenção personalizada!',
    'Serviço único!',
    'Experiência diferenciada!',
    'Cuidado especial!'
  ];
  
  if (!resposta.includes('exclusivo') && !resposta.includes('único') && !resposta.includes('especial')) {
    const fraseEscolhida = frasesExclusividade[Math.floor(Math.random() * frasesExclusividade.length)];
    return resposta.replace(/([.!?])\s*$/, ` ${fraseEscolhida}$1`);
  }
  
  return resposta;
}

/**
 * Aplica gatilho de prova social
 */
function aplicarProvaSocial(resposta, intensidade) {
  if (intensidade < 0.5) return resposta;
  
  const frasesProvaSocial = [
    'Nossos clientes adoram!',
    'Muito bem avaliado!',
    'Todos recomendam!',
    'Satisfação garantida!',
    'Clientes satisfeitos!'
  ];
  
  if (!resposta.includes('clientes') && !resposta.includes('recomendam') && !resposta.includes('avaliam')) {
    const fraseEscolhida = frasesProvaSocial[Math.floor(Math.random() * frasesProvaSocial.length)];
    return resposta.replace(/([.!?])\s*$/, ` ${fraseEscolhida}$1`);
  }
  
  return resposta;
}

/**
 * Aplica gatilho de autoridade
 */
function aplicarAutoridade(resposta, intensidade) {
  if (intensidade < 0.5) return resposta;
  
  const frasesAutoridade = [
    'Profissionais certificados!',
    'Especialistas no assunto!',
    'Tecnologia avançada!',
    'Qualidade comprovada!',
    'Experiência garantida!'
  ];
  
  if (!resposta.includes('profissional') && !resposta.includes('especialista') && !resposta.includes('certificado')) {
    const fraseEscolhida = frasesAutoridade[Math.floor(Math.random() * frasesAutoridade.length)];
    return resposta.replace(/([.!?])\s*$/, ` ${fraseEscolhida}$1`);
  }
  
  return resposta;
}

/**
 * Aplica gatilho de segurança
 */
function aplicarSeguranca(resposta, intensidade) {
  if (intensidade < 0.5) return resposta;
  
  const frasesSeguranca = [
    '100% seguro!',
    'Garantia total!',
    'Sem riscos!',
    'Confiança garantida!',
    'Tranquilidade total!'
  ];
  
  if (!resposta.includes('seguro') && !resposta.includes('garantia') && !resposta.includes('confiança')) {
    const fraseEscolhida = frasesSeguranca[Math.floor(Math.random() * frasesSeguranca.length)];
    return resposta.replace(/([.!?])\s*$/, ` ${fraseEscolhida}$1`);
  }
  
  return resposta;
}

/**
 * Aplica gatilho de bem-estar
 */
function aplicarBemestar(resposta, intensidade) {
  if (intensidade < 0.5) return resposta;
  
  const frasesBemestar = [
    'Para seu bem-estar!',
    'Cuidado especial!',
    'Momentos relaxantes!',
    'Qualidade de vida!',
    'Saúde e beleza!'
  ];
  
  if (!resposta.includes('bem-estar') && !resposta.includes('relaxante') && !resposta.includes('cuidado')) {
    const fraseEscolhida = frasesBemestar[Math.floor(Math.random() * frasesBemestar.length)];
    return resposta.replace(/([.!?])\s*$/, ` ${fraseEscolhida}$1`);
  }
  
  return resposta;
}

/**
 * Aplica gatilho de conveniência
 */
function aplicarConveniencia(resposta, intensidade) {
  if (intensidade < 0.5) return resposta;
  
  const frasesConveniencia = [
    'Horários flexíveis!',
    'Localização privilegiada!',
    'Atendimento rápido!',
    'Praticidade total!',
    'Facilidade garantida!'
  ];
  
  if (!resposta.includes('flexível') && !resposta.includes('prático') && !resposta.includes('fácil')) {
    const fraseEscolhida = frasesConveniencia[Math.floor(Math.random() * frasesConveniencia.length)];
    return resposta.replace(/([.!?])\s*$/, ` ${fraseEscolhida}$1`);
  }
  
  return resposta;
}

/**
 * Adiciona elementos de urgência e escassez baseados no contexto
 */
function adicionarUrgenciaEscassez(resposta, cliente, contexto) {
  let respostaAdaptada = resposta;
  const memoriaEmocional = contexto.memoriaEmocional || {};
  const estadoFunil = contexto.estadoFunil || {};
  
  // Se cliente tem alta urgência, reforçar
  if (memoriaEmocional.urgencia > 0.7) {
    if (!respostaAdaptada.includes('agora') && !respostaAdaptada.includes('já')) {
      respostaAdaptada = respostaAdaptada.replace(/([.!?])\s*$/, ' Agende agora!$1');
    }
  }
  
  // Se está no final do funil, adicionar escassez
  if (estadoFunil.etapaAtual === 'acao' || estadoFunil.etapaAtual === 'fechamento') {
    if (!respostaAdaptada.includes('limitado') && !respostaAdaptada.includes('últimas')) {
      respostaAdaptada = respostaAdaptada.replace(/([.!?])\s*$/, ' Vagas limitadas!$1');
    }
  }
  
  return respostaAdaptada;
}

/**
 * Aplica prova social e autoridade de forma contextual
 */
function aplicarProvaSocialAutoridade(resposta, cliente, contexto) {
  let respostaAdaptada = resposta;
  const memoriaEmocional = contexto.memoriaEmocional || {};
  
  // Se cliente tem objeções, usar prova social
  if (memoriaEmocional.objeções && memoriaEmocional.objeções.length > 0) {
    if (!respostaAdaptada.includes('clientes') && !respostaAdaptada.includes('recomendam')) {
      respostaAdaptada = respostaAdaptada.replace(/([.!?])\s*$/, ' Nossos clientes adoram!$1');
    }
  }
  
  // Se confiança baixa, usar autoridade
  if (memoriaEmocional.confianca < 0.4) {
    if (!respostaAdaptada.includes('profissional') && !respostaAdaptada.includes('especialista')) {
      respostaAdaptada = respostaAdaptada.replace(/([.!?])\s*$/, ' Profissionais certificados!$1');
    }
  }
  
  return respostaAdaptada;
}

/**
 * Aplica reciprocidade e compromisso
 */
function aplicarReciprocidadeCompromisso(resposta, cliente, contexto) {
  let respostaAdaptada = resposta;
  const estadoFunil = contexto.estadoFunil || {};
  
  // Se está no início do funil, oferecer algo primeiro (reciprocidade)
  if (estadoFunil.etapaAtual === 'descoberta' || estadoFunil.etapaAtual === 'interesse') {
    if (!respostaAdaptada.includes('gratuito') && !respostaAdaptada.includes('cortesia')) {
      respostaAdaptada = respostaAdaptada.replace(/([.!?])\s*$/, ' Primeira consulta gratuita!$1');
    }
  }
  
  // Se está próximo do fechamento, pedir compromisso pequeno
  if (estadoFunil.etapaAtual === 'acao' || estadoFunil.etapaAtual === 'fechamento') {
    if (!respostaAdaptada.includes('confirmar') && !respostaAdaptada.includes('confirmar')) {
      respostaAdaptada = respostaAdaptada.replace(/([.!?])\s*$/, ' Confirme seu interesse!$1');
    }
  }
  
  return respostaAdaptada;
}

/**
 * Registra gatilhos aplicados para análise
 */
function registrarGatilhosAplicados(cliente, gatilhos) {
  const cacheKey = cliente.nomeArquivo;
  const agora = Date.now();
  
  let historico = get('gatilhos', cacheKey, cliente.nomeArquivo) || {
    gatilhos: [],
    ultimaAtualizacao: agora
  };
  
  gatilhos.forEach(gatilho => {
    historico.gatilhos.push({
      tipo: gatilho.tipo,
      intensidade: gatilho.intensidade,
      timestamp: agora
    });
  });
  
  historico.ultimaAtualizacao = agora;
  set('gatilhos', cacheKey, historico, cliente.nomeArquivo);
}



/**
 * Obtém histórico de gatilhos aplicados
 */
export function obterHistoricoGatilhos(cliente) {
  return get('gatilhos', cliente.nomeArquivo, cliente.nomeArquivo) || {
    gatilhos: [],
    ultimaAtualizacao: Date.now()
  };
}

/**
 * Analisa eficácia dos gatilhos baseado no histórico
 */
export function analisarEficaciaGatilhos(cliente) {
  const historico = obterHistoricoGatilhos(cliente);
  const analise = {
    gatilhosMaisUsados: {},
    eficaciaEstimada: {},
    recomendacoes: []
  };
  
  // Verificar se há gatilhos no histórico
  if (!historico.gatilhos || !Array.isArray(historico.gatilhos)) {
    return analise;
  }
  
  // Contar uso de cada gatilho
  historico.gatilhos.forEach(gatilho => {
    analise.gatilhosMaisUsados[gatilho.tipo] = (analise.gatilhosMaisUsados[gatilho.tipo] || 0) + 1;
  });
  
  // Estimar eficácia baseada na intensidade média
  historico.gatilhos.forEach(gatilho => {
    if (!analise.eficaciaEstimada[gatilho.tipo]) {
      analise.eficaciaEstimada[gatilho.tipo] = {
        intensidadeMedia: 0,
        uso: 0
      };
    }
    
    analise.eficaciaEstimada[gatilho.tipo].intensidadeMedia += gatilho.intensidade;
    analise.eficaciaEstimada[gatilho.tipo].uso += 1;
  });
  
  // Calcular média de intensidade
  Object.keys(analise.eficaciaEstimada).forEach(tipo => {
    const dados = analise.eficaciaEstimada[tipo];
    dados.intensidadeMedia = dados.intensidadeMedia / dados.uso;
  });
  
  // Gerar recomendações
  const gatilhosOrdenados = Object.entries(analise.eficaciaEstimada)
    .sort(([,a], [,b]) => b.intensidadeMedia - a.intensidadeMedia);
  
  if (gatilhosOrdenados.length > 0) {
    const melhorGatilho = gatilhosOrdenados[0];
    analise.recomendacoes.push(`Focar no gatilho "${melhorGatilho[0]}" (eficácia: ${(melhorGatilho[1].intensidadeMedia * 100).toFixed(0)}%)`);
  }
  
  return analise;
}
