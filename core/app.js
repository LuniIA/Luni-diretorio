// app.js v5.0 – GPT-4 fixo + budgets de tokens + meta para logs

import 'dotenv/config';

import { detectarLink } from '../Utils/unified.js';
import { gerarRespostaLink } from '../Utils/responseHelper.js';
import { detectarFocoEAtualizar } from './focoEngine.js';
import { construirPrompt, gerarRespostaIA } from './iaResponder.js';
import { registrarAgendamento } from './agendamento.js';
import { logEntrada, logSaida, logErro } from '../Utils/logger.js';
import { atualizarFocos } from '../focos/helpers/focoManager.js';

import { temIntencaoDeAgendamento, temIntencaoDeCompra } from '../focos/helpers/detectorDeFoco.js';

import { detectarIntencao } from '../contextEngine/tagger.js';
import { verificarNovaSessao } from './sessionManager.js';
import { atualizarCapitulo } from '../contextEngine/chapterManager.js';
import { definirVariavel, getVariaveisValidas } from '../contextEngine/variableManager.js';
import gerarContexto from '../contextEngine/contextRouter.js';
import { adicionarInteracaoHistorico } from './contextManager.js';

import { debugLog } from '../Utils/debugLog.js';
import { resolveBudgetsForCliente } from './planManager.js';

// 🎭 SISTEMA DE PERSONALIDADE VENDEDORA GLOBAL
import { 
  gerarPersonalidadeVendedora, 
  atualizarMemoriaEmocional, 
  obterMemoriaEmocional,
  aplicarPersonalidadeResposta 
} from './personalidadeVendedora.js';

// 🎯 SISTEMA DE FUNIL DE VENDAS INTELIGENTE GLOBAL
import {
  detectarEtapaFunil,
  aplicarConducaoFunil,
  obterEstadoFunil,
  resetarFunil
} from './funilVendas.js';

// 🧠 SISTEMA DE GATILHOS MENTAIS AVANÇADOS GLOBAL
import {
  aplicarGatilhosMentais,
  obterHistoricoGatilhos,
  analisarEficaciaGatilhos
} from './gatilhosMentais.js';

// 🔧 Defaults globais; serão sobrepostos por plano do cliente por interação
const DEFAULT_MODEL = process.env.LUNI_MODEL || 'gpt-4-turbo';
const DEFAULT_TOKENS_IN_BUDGET = Number(process.env.LUNI_TOKENS_IN || 5000);
const DEFAULT_TOKENS_OUT_BUDGET = Number(process.env.LUNI_TOKENS_OUT || 700);
const DEFAULT_USD_IN_PER_1K = Number(process.env.COST_IN_PER_1K || 0.01);
const DEFAULT_USD_OUT_PER_1K = Number(process.env.COST_OUT_PER_1K || 0.03);

// Tokenizer temporariamente desabilitado para compatibilidade
// import { encoding_for_model } from 'gpt-tokenizer'; // v2 API compat
let enc = null;
// try { enc = encoding_for_model(MODEL); } catch { enc = encoding_for_model('gpt-4'); }

export async function processaMensagem(
  mensagem,
  cliente,
  primeiraInteracao,
  periodoDia,
  tipoMensagem = 'texto',
  focoAtual = null,
  metaCtx = {} // { sessionId, clienteId }
) {
  logEntrada(cliente, mensagem);
  const budgets = resolveBudgetsForCliente(cliente, {
    tokensIn: DEFAULT_TOKENS_IN_BUDGET,
    tokensOut: DEFAULT_TOKENS_OUT_BUDGET,
    usdIn: DEFAULT_USD_IN_PER_1K,
    usdOut: DEFAULT_USD_OUT_PER_1K,
    model: DEFAULT_MODEL
  });

  const MODEL = budgets.model;
  const TOKENS_IN_BUDGET = budgets.tokensIn;
  const TOKENS_OUT_BUDGET = budgets.tokensOut;
  const USD_IN_PER_1K = budgets.usdInPer1k;
  const USD_OUT_PER_1K = budgets.usdOutPer1k;

  debugLog('app > inicio processaMensagem', { cliente: cliente.nome, plano: budgets.plan, MODEL });

  const t0 = Date.now();

  try {
    // 1) Link curto
    if (detectarLink(mensagem)) {
      const respostaLink = gerarRespostaLink(cliente);
      debugLog('app > link detectado', { mensagem, respostaLink });
      logSaida(cliente, respostaLink, Date.now() - t0, { model: MODEL });
      return { resposta: respostaLink, focoAtualizado: focoAtual, meta: baseMeta(MODEL) };
    }

    // 2) Foco leve
    const focoDetectado = await detectarFocoEAtualizar(mensagem, cliente);
    debugLog('app > focoDetectado', focoDetectado);

    const ag = Array.isArray(focoDetectado?.agendamento) ? focoDetectado.agendamento[0] : null;
    const servicoRelacionado =
      (Array.isArray(focoDetectado?.servico) && focoDetectado.servico[0]?.nome) ||
      (Array.isArray(focoDetectado?.produto) && focoDetectado.produto[0]?.nome) ||
      null;

    // 3) Tagging
    const tagsDetectadas = detectarIntencao(mensagem, cliente.produtosServicos || []);
    debugLog('app > tagsDetectadas', tagsDetectadas);
    const intencaoAtual = focoDetectado?.intencaoAtual || (tagsDetectadas[0] || null);

    // 4) Sessão
    const { novaSessao, motivo } = verificarNovaSessao(
      cliente.ultimaMensagem,
      tagsDetectadas,
      cliente.nomeArquivo
    );
    debugLog('app > verificarNovaSessao', { novaSessao, motivo });

    // 5) Capítulo & variáveis
    const capituloMudouPelaIntencao =
      !!intencaoAtual && intencaoAtual !== cliente?.ultimaIntencaoDetectada;

    if (novaSessao || capituloMudouPelaIntencao) {
      const meta = {
        item: servicoRelacionado || null,
        data: ag?.data || null,
        hora: ag?.horario || null,
        bairro: ag?.regiao || null
      };

      atualizarCapitulo(
        cliente.nomeArquivo,
        [...(tagsDetectadas || []), (intencaoAtual || 'conversa_geral')],
        meta
      );

      if (intencaoAtual) definirVariavel(cliente.nomeArquivo, 'ultimaIntencaoDetectada', intencaoAtual, 60 * 60 * 1000);
      if (servicoRelacionado) definirVariavel(cliente.nomeArquivo, 'servicoEmFoco', servicoRelacionado);
      if (ag?.data) definirVariavel(cliente.nomeArquivo, 'agendamento.data', ag.data);
      if (ag?.horario) definirVariavel(cliente.nomeArquivo, 'agendamento.horario', ag.horario);
      if (ag?.regiao) definirVariavel(cliente.nomeArquivo, 'agendamento.regiao', ag.regiao);
      if (focoDetectado?.contatoCliente?.nome) definirVariavel(cliente.nomeArquivo, 'contato.nome', focoDetectado.contatoCliente.nome);
      if (focoDetectado?.contatoCliente?.telefone) definirVariavel(cliente.nomeArquivo, 'contato.telefone', focoDetectado.contatoCliente.telefone);

      debugLog('app > capitulo/vars atualizados', { intencaoAtual, servicoRelacionado, ag });
      cliente.ultimaIntencaoDetectada = intencaoAtual;
    }

    // 6) LCE / Contexto
    const contexto = await gerarContexto({
      mensagem,
      cliente,
      ultimaInteracaoTimestamp: cliente.ultimaMensagem || null
    });
    debugLog('app > contexto gerado', { chaves: Object.keys(contexto || {}) });

    // 7) Prompt → IA (com headroom e contexto otimizado)
    const promptSistema = await construirPrompt(
      cliente,
      primeiraInteracao,
      periodoDia,
      tipoMensagem,
      { 
        contexto, 
        targetTokensIn: TOKENS_IN_BUDGET,
        ultimasInteracoes: contexto?.ultimasInteracoes || []
      }
    );

    if (!promptSistema || promptSistema.length < 20) {
      const erroMsg = '⚠️ Desculpe, não consegui interpretar sua pergunta. Pode tentar novamente?';
      logSaida(cliente, erroMsg, Date.now() - t0, { model: MODEL });
      return { resposta: erroMsg, focoAtualizado: focoDetectado, meta: baseMeta(MODEL) };
    }

    // Contagem de tokens de entrada (telemetria e aviso)
    let tokensIn = 0;
    try {
      if (enc) {
        tokensIn = enc.encode(String(promptSistema)).length + enc.encode(String(mensagem)).length;
        if (tokensIn > TOKENS_IN_BUDGET) {
          debugLog('app > aviso: tokensIn excedeu budget', { tokensIn, TOKENS_IN_BUDGET });
        }
      } else {
        // Estimativa simples quando tokenizer não está disponível
        tokensIn = Math.ceil((String(promptSistema).length + String(mensagem).length) / 4);
      }
    } catch {}

    // Chamada IA com opções de modelo e budgets
    const iaStart = Date.now();
    const { respostaGerada, tempoMs, tokensOut = null, modelUsed = MODEL } = await gerarRespostaIA(
      promptSistema,
      mensagem,
      {
        model: MODEL,
        maxInputTokens: TOKENS_IN_BUDGET,
        maxOutputTokens: TOKENS_OUT_BUDGET
      }
    );
    const latIA = Date.now() - iaStart;

    // 🎭 7.1) APLICAR PERSONALIDADE VENDEDORA GLOBAL
    const memoriaEmocional = obterMemoriaEmocional(cliente);
    let respostaFinal = aplicarPersonalidadeResposta(respostaGerada, cliente, memoriaEmocional);
    
    // Atualizar memória emocional com a interação
    atualizarMemoriaEmocional(cliente, mensagem, respostaFinal, {
      intencao: intencaoAtual,
      servicoRelacionado,
      agendamento: ag
    });

                // 🎯 7.2) APLICAR FUNIL DE VENDAS INTELIGENTE GLOBAL
            const estadoFunil = detectarEtapaFunil(cliente, mensagem, contexto?.ultimasInteracoes || []);
            respostaFinal = aplicarConducaoFunil(respostaFinal, cliente, estadoFunil);

            // 🧠 7.3) APLICAR GATILHOS MENTAIS AVANÇADOS GLOBAL
            const contextoGatilhos = {
              personalidade: gerarPersonalidadeVendedora(cliente),
              memoriaEmocional,
              estadoFunil
            };
            respostaFinal = aplicarGatilhosMentais(respostaFinal, cliente, contextoGatilhos);

    // 8) Agendamento
    if (temIntencaoDeAgendamento(mensagem) || intencaoAtual?.includes('agend')) {
      try {
        const resultadoAgendamento = await registrarAgendamento(
          respostaGerada,
          mensagem,
          cliente,
          { focoDetectadoSnapshot: focoDetectado }
        );
        if (resultadoAgendamento?.mensagem) respostaFinal = resultadoAgendamento.mensagem;

        if (cliente.tipoAgendamento === 'googleCalendar' && cliente.emailGoogleCalendar) {
          const { criarEventoSimples } = await import('./calendarIntegration.js');
          await criarEventoSimples({
            resumo: `Agendamento via Luni - ${cliente.nome}${servicoRelacionado ? ` (${servicoRelacionado})` : ''}`,
            data: ag?.data || '',
            hora: ag?.horario || '',
            cliente
          });
        }
      } catch (erroInterno) {
        console.warn('⚠️ Erro ao tentar agendar:', erroInterno.message);
        respostaFinal = '⚠️ Tivemos uma instabilidade ao processar seu agendamento. Pode tentar novamente?';
      }
    }

    // 8.1) Fechamento de produto / pagamento
    try {
      const vars = getVariaveisValidas(cliente.nomeArquivo || 'cliente');
      const estadoFunil = vars['#estado_funil'];
      if (temIntencaoDeCompra(mensagem) || ['fechamento', 'pagamento'].includes(estadoFunil)) {
        const item = vars['#interesse_item'] || servicoRelacionado || null;
        const tam  = vars['#slot_tamanho'] || null;
        const cor  = vars['#slot_cor'] || null;
        const qtd  = vars['#slot_qtd'] || 1;

        if (item) {
          const variante =
            tam ? `(${tam}${cor ? `, ${cor}` : ''})` :
            (cor ? `(${cor})` : '');
          const resumo = `Pedido: ${item} ${variante || ''} x${qtd}.`.replace(/\s+/g, ' ').trim();
          try { definirVariavel(cliente.nomeArquivo, '#estado_funil', 'pagamento'); } catch {}
          const oferta = 'Posso te enviar o link de pagamento agora (Pix/Cartão)?';
          respostaFinal = `${resumo}\n${oferta}`;
          debugLog('app > fechamento de produto', { resumo, estadoAnterior: estadoFunil || null });
        }
      }
    } catch (e) {
      debugLog('app > erro bloco fechamento', { erro: e?.message || String(e) });
    }

    // 9) Consolidar focos no disco
    await atualizarFocos(cliente.nomeArquivo, {
      duvidasRecentes: [mensagem],
      ...(focoDetectado?.produto ? { produto: focoDetectado.produto } : {}),
      ...(focoDetectado?.servico ? { servico: focoDetectado.servico } : {}),
      ...(focoDetectado?.agendamento ? { agendamento: focoDetectado.agendamento } : {}),
      ...(focoDetectado?.contatoCliente ? { contatoCliente: focoDetectado.contatoCliente } : {}),
      intencaoAtual: intencaoAtual || null
    });

    // --- meta/telemetria ---
    const tokensOutSafe = Number(tokensOut || 0);
    const costUsd =
      (tokensIn / 1000) * USD_IN_PER_1K +
      (tokensOutSafe / 1000) * USD_OUT_PER_1K;

    // 10) Registrar interação no histórico inteligente
    adicionarInteracaoHistorico(cliente, mensagem, respostaFinal, {
      intencao: intencaoAtual,
      servicoRelacionado,
      agendamento: ag,
      tokensIn,
      tokensOut: tokensOutSafe,
      costUsd: Number(costUsd.toFixed(6))
    });

    const meta = {
      model: modelUsed || MODEL,
      tokensIn,
      tokensOut: tokensOutSafe,
      costUsd: Number(costUsd.toFixed(6)),
      latencyMs: Date.now() - t0,
      iaLatencyMs: latIA,
      ...metaCtx
    };

    logSaida(cliente, respostaFinal, meta.latencyMs, meta);
    return { resposta: respostaFinal, focoAtualizado: focoDetectado, meta };

  } catch (erro) {
    logErro(cliente, erro);
    const erroMsg = '⚠️ Estamos enfrentando instabilidades no atendimento. Por favor, tente novamente em alguns minutos.';
    return { resposta: erroMsg, focoAtualizado: focoAtual, meta: baseMeta(MODEL, true) };
  }
}

// util local
function baseMeta(model, err=false){
  return {
    model: model || DEFAULT_MODEL,
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
    latencyMs: 0,
    iaLatencyMs: 0,
    error: err
  };
}
