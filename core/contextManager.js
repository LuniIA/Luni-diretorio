// core/contextManager.js v2.0
// Sistema de contexto inteligente com histórico incremental e separação estático/dinâmico

import fs from 'fs';
import path from 'path';
import { debugLog } from '../Utils/debugLog.js';
import { createCache, get, set, del, clear, stats } from './cacheManager.js';

// Cache unificado para contexto estático e histórico recente
const contextoEstaticoCache = createCache('contextoEstatico', { ttlMs: 12 * 60 * 60 * 1000 }); // 12h
const historicoRecenteCache = createCache('historicoRecente', { ttlMs: 24 * 60 * 60 * 1000 }); // 24h

const HISTORICO_DIR = './historico/contexto';

/**
 * Carrega contexto estático do cliente (dados fixos)
 */
export function carregarContextoEstatico(cliente) {
  const cacheKey = cliente.nomeArquivo;
  
  const contextoCache = get('contextoEstatico', cacheKey, cliente.nomeArquivo);
  if (contextoCache) {
    debugLog('contextManager > contexto estático do cache', { cliente: cacheKey });
    return contextoCache;
  }

  const contextoEstatico = {
    nome: cliente.nome,
    segmento: cliente.segmento,
    produtosServicos: cliente.produtosServicos || [],
    profissionais: cliente.profissionais || [],
    diferencial: cliente.diferencial,
    promocoes: cliente.promocoes,
    funcionamento: cliente.funcionamento,
    publicoAlvo: cliente.publicoAlvo,
    dorCliente: cliente.dorCliente,
    linguagem: cliente.linguagem,
    emojis: cliente.emojis,
    frasePadrao: cliente.frasePadrao,
    tonsPreferidos: cliente.tonsPreferidos,
    termosProibidos: cliente.termosProibidos,
    intensidadeVendas: cliente.intensidadeVendas,
    tipoAgendamento: cliente.tipoAgendamento,
    modulosIA: cliente.modulosIA || {}
  };

  set('contextoEstatico', cacheKey, contextoEstatico, cliente.nomeArquivo);
  debugLog('contextManager > contexto estático carregado', { cliente: cacheKey });
  
  return contextoEstatico;
}

/**
 * Gera resumo inteligente do histórico (foco no que importa para fechar)
 */
export function gerarResumoHistorico(cliente, ultimasInteracoes = []) {
  if (!ultimasInteracoes.length) return '';

  const resumo = {
    intencoes: [],
    objeções: [],
    preferencias: [],
    prazos: [],
    contatos: []
  };

  ultimasInteracoes.forEach(interacao => {
    // Extrair intenções
    if (interacao.intencao) {
      resumo.intencoes.push(interacao.intencao);
    }
    
    // Extrair objeções
    if (interacao.objeção) {
      resumo.objeções.push(interacao.objeção);
    }
    
    // Extrair preferências
    if (interacao.preferencia) {
      resumo.preferencias.push(interacao.preferencia);
    }
    
    // Extrair prazos
    if (interacao.prazo) {
      resumo.prazos.push(interacao.prazo);
    }
    
    // Extrair contatos
    if (interacao.contato) {
      resumo.contatos.push(interacao.contato);
    }
  });

  // Remover duplicatas
  Object.keys(resumo).forEach(key => {
    resumo[key] = [...new Set(resumo[key])];
  });

  // Formatar resumo
  const blocos = [];
  if (resumo.intencoes.length) {
    blocos.push(`🎯 Intenções: ${resumo.intencoes.join(', ')}`);
  }
  if (resumo.objeções.length) {
    blocos.push(`⚠️ Objeções: ${resumo.objeções.join(', ')}`);
  }
  if (resumo.preferencias.length) {
    blocos.push(`❤️ Preferências: ${resumo.preferencias.join(', ')}`);
  }
  if (resumo.prazos.length) {
    blocos.push(`⏰ Prazos: ${resumo.prazos.join(', ')}`);
  }
  if (resumo.contatos.length) {
    blocos.push(`📞 Contatos: ${resumo.contatos.join(', ')}`);
  }

  return blocos.length ? `\n📋 RESUMO DA CONVERSA:\n${blocos.join('\n')}` : '';
}

/**
 * Adiciona interação ao histórico recente
 */
export function adicionarInteracaoHistorico(cliente, mensagem, resposta, meta = {}) {
  const cacheKey = cliente.nomeArquivo;
  const agora = Date.now();
  
  let historico = get('historicoRecente', cacheKey, cliente.nomeArquivo) || [];
  
  // Adicionar nova interação
  historico.push({
    timestamp: agora,
    mensagem,
    resposta,
    ...meta
  });
  
  // Manter apenas últimas 5 interações
  if (historico.length > 5) {
    historico.shift();
  }
  
  // Salvar no cache (TTL automático)
  set('historicoRecente', cacheKey, historico, cliente.nomeArquivo);
  
  debugLog('contextManager > interação adicionada ao histórico', { 
    cliente: cacheKey, 
    totalInteracoes: historico.length 
  });
}

/**
 * Obtém histórico recente para contexto
 */
export function obterHistoricoRecente(cliente) {
  const cacheKey = cliente.nomeArquivo;
  const historico = get('historicoRecente', cacheKey, cliente.nomeArquivo) || [];
  
  if (!historico.length) return '';
  
  const historicoFormatado = historico
    .map(h => `Cliente: ${h.mensagem}\nLuni: ${h.resposta}`)
    .join('\n\n');
  
  return `\n💬 ÚLTIMAS INTERAÇÕES:\n${historicoFormatado}`;
}

/**
 * Calcula tamanho estimado do contexto em tokens
 */
export function estimarTokensContexto(contexto) {
  const texto = JSON.stringify(contexto);
  return Math.ceil(texto.length / 4); // Estimativa aproximada
}

/**
 * Otimiza contexto para caber no budget de tokens
 */
export function otimizarContexto(contexto, budgetTokens = 5000) {
  const tokensAtuais = estimarTokensContexto(contexto);
  
  if (tokensAtuais <= budgetTokens) {
    return contexto;
  }
  
  // Estratégia de otimização: reduzir histórico primeiro
  const reducaoNecessaria = tokensAtuais - budgetTokens;
  const tokensPorInteracao = 200; // Estimativa
  const interacoesParaRemover = Math.ceil(reducaoNecessaria / tokensPorInteracao);
  
  debugLog('contextManager > otimizando contexto', { 
    tokensAtuais, 
    budgetTokens, 
    interacoesParaRemover 
  });
  
  // Implementar lógica de redução se necessário
  return contexto;
}

/**
 * Limpa cache de contexto estático
 */
export function limparCacheEstatico(cliente = null) {
  if (cliente) {
    del('contextoEstatico', cliente.nomeArquivo, cliente.nomeArquivo);
    debugLog('contextManager > cache estático limpo', { cliente: cliente.nomeArquivo });
  } else {
    clear('contextoEstatico');
    debugLog('contextManager > cache estático limpo completamente');
  }
}

/**
 * Limpa cache de histórico recente
 */
export function limparCacheHistorico(cliente = null) {
  if (cliente) {
    del('historicoRecente', cliente.nomeArquivo, cliente.nomeArquivo);
    debugLog('contextManager > cache histórico limpo', { cliente: cliente.nomeArquivo });
  } else {
    clear('historicoRecente');
    debugLog('contextManager > cache histórico limpo completamente');
  }
}

