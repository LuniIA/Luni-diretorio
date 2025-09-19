// contextRouter.js v2.0 – Orquestrador do contexto da IA + LOG e gravação semântica
// Mantém assinatura e retorno de v1.2

import { detectarIntencao } from './tagger.js';
import { isNovaSessao } from '../core/sessionManager.js';
import { carregarCapituloAtual, atualizarCapitulo } from './chapterManager.js';
import { getVariaveisValidas, salvarVariavel } from './variableManager.js';
import { debugLog } from '../Utils/debugLog.js'; // helper de log
import { extrairSlots, normalizarTexto } from '../Utils/unified.js';

/* ───────── helpers de parsing leve ───────── */
function norm(txt = '') {
  return normalizarTexto(txt);
}

function deduzirEtapaFunil(tags = [], atual = 'descoberta') {
  // evolução simples do funil, sem regredir etapas
  const ordem = ['descoberta', 'avaliando', 'intencao_agendar', 'intencao_comprar', 'agendamento_pendente'];
  const rank = etapa => Math.max(0, ordem.indexOf(etapa));

  let proxima = atual;
  if (tags.includes('pergunta_preco') || tags.includes('pergunta_servico')) {
    proxima = rank(proxima) < rank('avaliando') ? 'avaliando' : proxima;
  }
  if (tags.includes('intencao_agendar')) {
    proxima = rank(proxima) < rank('intencao_agendar') ? 'intencao_agendar' : proxima;
  }
  // opcional: se detectar sinais de compra direta (ex.: "quero comprar", "fechar pedido")
  if (/\b(comprar|fechar|finalizar|confirmar)\b/.test(atual)) {
    proxima = rank(proxima) < rank('intencao_comprar') ? 'intencao_comprar' : proxima;
  }
  return proxima;
}

/* ───────── fluxo principal ───────── */
export default async function gerarContexto({ mensagem, cliente, ultimaInteracaoTimestamp }) {
  const nomeArquivo = cliente?.nomeArquivo;
  if (!nomeArquivo || !mensagem) return {};

  debugLog('contextRouter > entrada', { nomeArquivo, mensagem });

  // 1) Intenções
  const tags = detectarIntencao(mensagem);

  // 2) Sessão
  const sessao = isNovaSessao(ultimaInteracaoTimestamp, tags, nomeArquivo);

  // 3) Capítulo (carrega/atualiza)
  let capituloAtual = carregarCapituloAtual(nomeArquivo);
  const precisaAtualizarCapitulo = sessao.novaSessao || !capituloAtual?.capituloAtual;

  const motivoCapitulo = tags[0] || (sessao.novaSessao ? 'nova_sessao' : 'conversa_geral');
  if (precisaAtualizarCapitulo) {
    // Capítulo nomeado apenas pelo foco principal
    capituloAtual = atualizarCapitulo(nomeArquivo, tags.length ? [tags[0]] : [], motivoCapitulo);
  }

  // 4) Variáveis existentes
  const variaveisValidas = getVariaveisValidas(nomeArquivo);

  // 5) Extração leve de contexto/slots + persistência semântica
  const textoNorm = norm(mensagem);
  const slots = extrairSlots(textoNorm, cliente?.produtosServicos || []);
  const item = slots.item; // Usar o item extraído pelos slots

  // 5.1 ultimaIntencaoDetectada
  if (tags.length) {
    salvarVariavel(nomeArquivo, 'ultimaIntencaoDetectada', tags[0]); // expiração padrão (48h)
  }

  // 5.2 ultimoItemSelecionado
  if (item) {
    salvarVariavel(nomeArquivo, 'ultimoItemSelecionado', {
      item,
      origem: 'contextRouter',
      atualizado_em: new Date().toISOString()
    });
  }

  // 5.3 ultimoPedidoAgendamento: grava/mescla somente se houver ao menos um slot
  if (slots.data || slots.hora || slots.regiao || tags.includes('intencao_agendar')) {
    salvarVariavel(nomeArquivo, 'ultimoPedidoAgendamento', {
      data: slots.data || null,
      hora: slots.hora || null,
      regiao: slots.regiao || null,
      origem: 'contextRouter',
      atualizado_em: new Date().toISOString()
    });
  }

  // 5.4 etapaFunilAtual (evolutiva, sem regredir)
  const etapaAtual = variaveisValidas?.etapaFunilAtual || 'descoberta';
  const etapaNova = deduzirEtapaFunil(tags, etapaAtual);
  if (etapaNova !== etapaAtual) {
    salvarVariavel(nomeArquivo, 'etapaFunilAtual', etapaNova);
  }

  const contexto = {
    tagsDetectadas: tags,
    capituloAtual,
    variaveisValidas: getVariaveisValidas(nomeArquivo), // recarrega após writes
    novaSessao: sessao.novaSessao,
    motivoSessao: sessao.motivo
  };

  debugLog('contextRouter > saída', contexto);
  return contexto;
}

// Exemplo de uso (comentado):
// const contexto = await gerarContexto({ mensagem: 'Quero massagem relaxante quarta 13h na zona sul', cliente, ultimaInteracaoTimestamp });
// -> salva variáveis ricas e retorna contexto atualizado
