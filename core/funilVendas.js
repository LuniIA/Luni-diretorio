// core/funilVendas.js v2.0
// Sistema de Funil de Vendas Inteligente Global - Funciona para qualquer tipo de negócio
// Foco: Condução ativa do cliente pelo funil de vendas

import { debugLog } from '../Utils/debugLog.js';
import { createCache, get, set, del, clear, stats } from './cacheManager.js';

// Cache unificado para estado do funil
const funilCache = createCache('funil', { ttlMs: 24 * 60 * 60 * 1000 }); // 24 horas

/**
 * ETAPAS DO FUNIL DE VENDAS UNIVERSAL
 * Sistema que funciona para qualquer tipo de negócio
 */
const ETAPAS_FUNIL = {
  DESCOBERTA: {
    id: 'descoberta',
    nome: 'Descoberta',
    objetivo: 'Entender necessidade do cliente',
    indicadores: ['primeira_mensagem', 'pergunta_geral', 'exploracao'],
    proximaAcao: 'qualificar_necessidade',
    gatilhos: ['autoridade', 'seguranca'],
    tempoMaximo: 300 // 5 minutos
  },
  INTERESSE: {
    id: 'interesse',
    nome: 'Interesse',
    objetivo: 'Despertar interesse no produto/serviço',
    indicadores: ['pergunta_especifica', 'demonstra_interesse', 'pede_informacao'],
    proximaAcao: 'demonstrar_valor',
    gatilhos: ['prova_social', 'beneficios'],
    tempoMaximo: 600 // 10 minutos
  },
  DESEJO: {
    id: 'desejo',
    nome: 'Desejo',
    objetivo: 'Criar desejo de compra',
    indicadores: ['compara_opcoes', 'pede_detalhes', 'demonstra_desejo'],
    proximaAcao: 'superar_objeções',
    gatilhos: ['exclusividade', 'urgencia'],
    tempoMaximo: 900 // 15 minutos
  },
  ACAO: {
    id: 'acao',
    nome: 'Ação',
    objetivo: 'Conduzir à decisão de compra',
    indicadores: ['pede_preco', 'pergunta_pagamento', 'quer_fechar'],
    proximaAcao: 'fechar_venda',
    gatilhos: ['escassez', 'oferta_especial'],
    tempoMaximo: 1200 // 20 minutos
  },
  FECHAMENTO: {
    id: 'fechamento',
    nome: 'Fechamento',
    objetivo: 'Finalizar a venda/agendamento',
    indicadores: ['aceita_proposta', 'confirma_compra', 'quer_agendar'],
    proximaAcao: 'confirmar_fechamento',
    gatilhos: ['garantia', 'suporte'],
    tempoMaximo: 1800 // 30 minutos
  }
};

/**
 * SISTEMA DE CONDUÇÃO DE FUNIL GLOBAL
 * Detecta e conduz o cliente pela etapa atual do funil
 */
export function detectarEtapaFunil(cliente, mensagem, historico = []) {
  const cacheKey = cliente.nomeArquivo;
  const agora = Date.now();
  
  // Carregar estado atual do funil
  let estadoFunil = get('funil', cacheKey, cliente.nomeArquivo) || {
    etapaAtual: ETAPAS_FUNIL.DESCOBERTA.id,
    tempoNaEtapa: 0,
    indicadoresDetectados: [],
    ultimaAtualizacao: agora,
    progresso: 0
  };

  // Analisar mensagem para detectar indicadores
  const indicadoresDetectados = detectarIndicadores(mensagem, historico);
  
  // Determinar nova etapa baseada nos indicadores
  const novaEtapa = determinarNovaEtapa(estadoFunil.etapaAtual, indicadoresDetectados, historico);
  
  // Atualizar estado do funil
  if (novaEtapa !== estadoFunil.etapaAtual) {
    estadoFunil.etapaAtual = novaEtapa;
    estadoFunil.tempoNaEtapa = 0;
    estadoFunil.indicadoresDetectados = [];
    debugLog('funilVendas > etapa mudou', {
      cliente: cliente.nomeArquivo,
      de: estadoFunil.etapaAtual,
      para: novaEtapa
    });
  } else {
    estadoFunil.tempoNaEtapa += (agora - estadoFunil.ultimaAtualizacao) / 1000;
  }

  // Adicionar novos indicadores
  estadoFunil.indicadoresDetectados = [...new Set([...estadoFunil.indicadoresDetectados, ...indicadoresDetectados])];
  estadoFunil.ultimaAtualizacao = agora;
  
  // Calcular progresso (0-100%)
  estadoFunil.progresso = calcularProgresso(estadoFunil.etapaAtual, estadoFunil.indicadoresDetectados);
  
  // Salvar no cache
  set('funil', cacheKey, estadoFunil, cliente.nomeArquivo);
  
  debugLog('funilVendas > etapa detectada', {
    cliente: cliente.nomeArquivo,
    etapa: estadoFunil.etapaAtual,
    progresso: estadoFunil.progresso,
    tempoNaEtapa: estadoFunil.tempoNaEtapa
  });
  
  return estadoFunil;
}

/**
 * Detecta indicadores na mensagem e histórico
 */
function detectarIndicadores(mensagem, historico = []) {
  const mensagemLower = mensagem.toLowerCase();
  const indicadores = [];
  
  // Indicadores de DESCOBERTA
  if (mensagemLower.includes('oi') || mensagemLower.includes('olá') || mensagemLower.includes('bom dia')) {
    indicadores.push('primeira_mensagem');
  }
  if (mensagemLower.includes('como') || mensagemLower.includes('o que') || mensagemLower.includes('quais')) {
    indicadores.push('pergunta_geral');
  }
  if (mensagemLower.includes('quanto') || mensagemLower.includes('preço') || mensagemLower.includes('custa')) {
    indicadores.push('exploracao');
  }
  
  // Indicadores de INTERESSE
  if (mensagemLower.includes('interessante') || mensagemLower.includes('legal') || mensagemLower.includes('bom')) {
    indicadores.push('demonstra_interesse');
  }
  if (mensagemLower.includes('quero saber') || mensagemLower.includes('mais informações') || mensagemLower.includes('detalhes')) {
    indicadores.push('pede_informacao');
  }
  if (mensagemLower.includes('como funciona') || mensagemLower.includes('processo') || mensagemLower.includes('passo')) {
    indicadores.push('pergunta_especifica');
  }
  
  // Indicadores de DESEJO
  if (mensagemLower.includes('quero') || mensagemLower.includes('gostaria') || mensagemLower.includes('preciso')) {
    indicadores.push('demonstra_desejo');
  }
  if (mensagemLower.includes('qual a diferença') || mensagemLower.includes('comparar') || mensagemLower.includes('opções')) {
    indicadores.push('compara_opcoes');
  }
  if (mensagemLower.includes('tempo') || mensagemLower.includes('prazo') || mensagemLower.includes('quando')) {
    indicadores.push('pede_detalhes');
  }
  
  // Indicadores de AÇÃO
  if (mensagemLower.includes('quanto custa') || mensagemLower.includes('valor') || mensagemLower.includes('preço')) {
    indicadores.push('pede_preco');
  }
  if (mensagemLower.includes('como pagar') || mensagemLower.includes('pagamento') || mensagemLower.includes('pix')) {
    indicadores.push('pergunta_pagamento');
  }
  if (mensagemLower.includes('quero comprar') || mensagemLower.includes('fazer pedido') || mensagemLower.includes('finalizar')) {
    indicadores.push('quer_fechar');
  }
  
  // Indicadores de FECHAMENTO
  if (mensagemLower.includes('ok') || mensagemLower.includes('beleza') || mensagemLower.includes('perfeito')) {
    indicadores.push('aceita_proposta');
  }
  if (mensagemLower.includes('confirmar') || mensagemLower.includes('sim') || mensagemLower.includes('vamos')) {
    indicadores.push('confirma_compra');
  }
  if (mensagemLower.includes('agendar') || mensagemLower.includes('marcar') || mensagemLower.includes('horário')) {
    indicadores.push('quer_agendar');
  }
  
  return indicadores;
}

/**
 * Determina nova etapa baseada nos indicadores
 */
function determinarNovaEtapa(etapaAtual, indicadores, historico) {
  const etapas = Object.values(ETAPAS_FUNIL);
  const etapaIndex = etapas.findIndex(e => e.id === etapaAtual);
  
  // Se já está no fechamento, mantém
  if (etapaAtual === ETAPAS_FUNIL.FECHAMENTO.id) {
    return etapaAtual;
  }
  
  // Verificar se há indicadores de etapas mais avançadas
  for (let i = etapaIndex + 1; i < etapas.length; i++) {
    const etapa = etapas[i];
    const indicadoresEtapa = etapa.indicadores;
    
    // Se detectou indicadores de etapa mais avançada, avança
    if (indicadores.some(ind => indicadoresEtapa.includes(ind))) {
      return etapa.id;
    }
  }
  
  // Verificar se há indicadores de etapa anterior (regressão)
  for (let i = etapaIndex - 1; i >= 0; i--) {
    const etapa = etapas[i];
    const indicadoresEtapa = etapa.indicadores;
    
    // Se detectou indicadores de etapa anterior, regride
    if (indicadores.some(ind => indicadoresEtapa.includes(ind))) {
      return etapa.id;
    }
  }
  
  return etapaAtual;
}

/**
 * Calcula progresso no funil (0-100%)
 */
function calcularProgresso(etapaAtual, indicadoresDetectados) {
  const etapas = Object.values(ETAPAS_FUNIL);
  const etapaIndex = etapas.findIndex(e => e.id === etapaAtual);
  
  // Progresso baseado na etapa (20% por etapa)
  let progresso = (etapaIndex + 1) * 20;
  
  // Bônus baseado nos indicadores detectados
  const indicadoresBonus = Math.min(indicadoresDetectados.length * 5, 20);
  progresso += indicadoresBonus;
  
  return Math.min(progresso, 100);
}

/**
 * Obtém próxima ação recomendada para a etapa atual
 */
export function obterProximaAcao(cliente, estadoFunil) {
  const etapa = ETAPAS_FUNIL[estadoFunil.etapaAtual.toUpperCase()];
  if (!etapa) return null;
  
  const acoes = {
    qualificar_necessidade: {
      acao: 'Fazer perguntas para entender melhor a necessidade',
      perguntas: [
        'Qual é o seu objetivo principal?',
        'Que problema você está tentando resolver?',
        'Qual é o seu prazo ideal?'
      ],
      gatilhos: etapa.gatilhos
    },
    demonstrar_valor: {
      acao: 'Mostrar benefícios e valor do produto/serviço',
      elementos: [
        'Benefícios principais',
        'Diferenciais competitivos',
        'Prova social (testimonials)'
      ],
      gatilhos: etapa.gatilhos
    },
    superar_objeções: {
      acao: 'Identificar e superar objeções',
      tecnicas: [
        'Validar a objeção',
        'Oferecer alternativas',
        'Demonstrar valor superior'
      ],
      gatilhos: etapa.gatilhos
    },
    fechar_venda: {
      acao: 'Conduzir ao fechamento',
      tecnicas: [
        'Assumptive close',
        'Alternative close',
        'Urgency close'
      ],
      gatilhos: etapa.gatilhos
    },
    confirmar_fechamento: {
      acao: 'Confirmar e finalizar',
      elementos: [
        'Resumo do que foi acordado',
        'Próximos passos',
        'Confirmação de pagamento/agendamento'
      ],
      gatilhos: etapa.gatilhos
    }
  };
  
  return acoes[etapa.proximaAcao] || acoes.qualificar_necessidade;
}

/**
 * Gera gatilhos mentais para a etapa atual
 */
export function gerarGatilhosEtapa(cliente, estadoFunil) {
  const etapa = ETAPAS_FUNIL[estadoFunil.etapaAtual.toUpperCase()];
  if (!etapa) return [];
  
  const gatilhosPorEtapa = {
    descoberta: [
      { tipo: 'autoridade', frase: 'Somos especialistas no mercado há X anos' },
      { tipo: 'seguranca', frase: 'Milhares de clientes confiam em nós' }
    ],
    interesse: [
      { tipo: 'prova_social', frase: '87% dos nossos clientes recomendam' },
      { tipo: 'beneficios', frase: 'Você vai economizar tempo e dinheiro' }
    ],
    desejo: [
      { tipo: 'exclusividade', frase: 'Oferta exclusiva para você' },
      { tipo: 'urgencia', frase: 'Essa oportunidade é por tempo limitado' }
    ],
    acao: [
      { tipo: 'escassez', frase: 'Últimas unidades disponíveis' },
      { tipo: 'oferta_especial', frase: 'Desconto especial de X%' }
    ],
    fechamento: [
      { tipo: 'garantia', frase: 'Garantia de satisfação total' },
      { tipo: 'suporte', frase: 'Suporte completo incluso' }
    ]
  };
  
  return gatilhosPorEtapa[estadoFunil.etapaAtual] || [];
}

/**
 * Verifica se cliente está "travado" em uma etapa
 */
export function verificarTravamento(cliente, estadoFunil) {
  const etapa = ETAPAS_FUNIL[estadoFunil.etapaAtual.toUpperCase()];
  if (!etapa) return false;
  
  // Se está há muito tempo na mesma etapa
  if (estadoFunil.tempoNaEtapa > etapa.tempoMaximo) {
    return {
      travado: true,
      motivo: 'tempo_excedido',
      acao: 'Retomar conversa com abordagem diferente'
    };
  }
  
  // Se não detectou indicadores suficientes
  if (estadoFunil.indicadoresDetectados.length < 2) {
    return {
      travado: true,
      motivo: 'poucos_indicadores',
      acao: 'Fazer perguntas mais direcionadas'
    };
  }
  
  return { travado: false };
}

/**
 * Aplica estratégia de condução do funil
 */
export function aplicarConducaoFunil(resposta, cliente, estadoFunil) {
  let respostaConduzida = resposta;
  const proximaAcao = obterProximaAcao(cliente, estadoFunil);
  const gatilhos = gerarGatilhosEtapa(cliente, estadoFunil);
  const travamento = verificarTravamento(cliente, estadoFunil);
  
  // 1. Adicionar elementos da próxima ação se necessário
  if (proximaAcao && !respostaConduzida.includes(proximaAcao.acao)) {
    const elementoAcao = proximaAcao.perguntas ? 
      proximaAcao.perguntas[0] : 
      proximaAcao.elementos ? 
      proximaAcao.elementos[0] : 
      proximaAcao.tecnicas ? 
      proximaAcao.tecnicas[0] : '';
    
    if (elementoAcao) {
      respostaConduzida += `\n\n${elementoAcao}`;
    }
  }
  
  // 2. Adicionar gatilhos mentais se apropriado
  if (gatilhos.length > 0 && !respostaConduzida.includes(gatilhos[0].frase)) {
    const gatilhoEscolhido = gatilhos[Math.floor(Math.random() * gatilhos.length)];
    respostaConduzida += `\n\n${gatilhoEscolhido.frase}`;
  }
  
  // 3. Tratar travamento se detectado
  if (travamento.travado) {
    respostaConduzida += `\n\n${travamento.acao}`;
  }
  
  // 4. Adicionar CTA baseado na etapa
  const cta = gerarCTAParaEtapa(estadoFunil.etapaAtual);
  if (cta && !respostaConduzida.includes(cta)) {
    respostaConduzida += `\n\n${cta}`;
  }
  
  debugLog('funilVendas > condução aplicada', {
    cliente: cliente.nomeArquivo,
    etapa: estadoFunil.etapaAtual,
    progresso: estadoFunil.progresso,
    travamento: travamento.travado
  });
  
  return respostaConduzida;
}

/**
 * Gera CTA (Call-to-Action) para a etapa atual
 */
function gerarCTAParaEtapa(etapaAtual) {
  const ctas = {
    descoberta: 'Quer que eu te ajude a encontrar a melhor solução?',
    interesse: 'Quer que eu te mostre mais detalhes?',
    desejo: 'Quer que eu te ajude a escolher a melhor opção?',
    acao: 'Quer que eu te ajude a finalizar agora?',
    fechamento: 'Posso confirmar tudo para você?'
  };
  
  return ctas[etapaAtual] || ctas.descoberta;
}



/**
 * Obtém estado atual do funil
 */
export function obterEstadoFunil(cliente) {
  return get('funil', cliente.nomeArquivo, cliente.nomeArquivo) || {
    etapaAtual: ETAPAS_FUNIL.DESCOBERTA.id,
    tempoNaEtapa: 0,
    indicadoresDetectados: [],
    ultimaAtualizacao: Date.now(),
    progresso: 0
  };
}

/**
 * Reseta funil para um cliente (nova conversa)
 */
export function resetarFunil(cliente) {
  del('funil', cliente.nomeArquivo, cliente.nomeArquivo);
  debugLog('funilVendas > funil resetado', { cliente: cliente.nomeArquivo });
}
