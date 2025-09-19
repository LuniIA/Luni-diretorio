// promptBuilder.js v3.8
// Gera o prompt completo baseado em dados do cliente, foco, comportamento e contexto LCE
// Compatível com focoManager v2.x/v3.x (usa getFocosValidos se existir) + LOG

import segmentos from '../Segmentos.js/index.js';

// Store Adapter para focos (Redis/Files)
import storeAdapter from '../config/storeAdapter.js';

import intensidadeVendas from '../comportamento/comportamentoIntensidade.js';

import { carregarCapituloAtual } from '../contextEngine/chapterManager.js';
import { getVariaveisValidas } from '../contextEngine/variableManager.js';
import { debugLog } from '../Utils/debugLog.js';          // helper central de logs
import { 
  carregarContextoEstatico, 
  gerarResumoHistorico, 
  obterHistoricoRecente,
  otimizarContexto 
} from './contextManager.js';

// 🎭 SISTEMA DE PERSONALIDADE VENDEDORA GLOBAL
import { gerarPersonalidadeVendedora, obterMemoriaEmocional } from './personalidadeVendedora.js';

// 🎯 SISTEMA DE FUNIL DE VENDAS INTELIGENTE GLOBAL
import { obterEstadoFunil, obterProximaAcao, gerarGatilhosEtapa } from './funilVendas.js';

// 🧠 SISTEMA DE GATILHOS MENTAIS AVANÇADOS GLOBAL
import { obterHistoricoGatilhos, analisarEficaciaGatilhos } from './gatilhosMentais.js';

// 🎯 SISTEMA DE FECHAMENTO ASSERTIVO GLOBAL
// import { obterHistoricoFechamentos, analisarEficaciaFechamentos, detectarSinaisProntidao } from './fechamentoAssertivo.js';

export async function construirPrompt(
  cliente,
  primeiraInteracao = false,
  periodoDia = null,
  tipoMensagem = 'texto',
  opcoes = {} // { contexto, targetTokensIn }
) {
  try {
    /* ─── 1. Contexto Estático (carregado uma vez por sessão) ─── */
    const contextoEstatico = carregarContextoEstatico(cliente);
    const segmento = contextoEstatico.segmento || 'geral';
    
    if (!segmentos[segmento]) {
      console.warn(`⚠️ Segmento "${segmento}" não encontrado. Usando "geral".`);
    }
    const basePrompt = segmentos[segmento] || segmentos['geral'];
    const comportamentoIntensidade = intensidadeVendas[contextoEstatico.intensidadeVendas || 2];

    /* ─── 2. Produtos & Profissionais ─── */
    const produtosDetalhados =
      contextoEstatico.produtosServicos?.map(
        (p) =>
          `• ${p.nome} - ${p.descricao || 'Descrição não informada'} | Preço: ${
            (typeof p.preco === 'number' ? `R$${p.preco.toFixed(2)}` : (p.preco ?? 'N/D'))
          } | Tamanhos: ${p.tamanhos?.join(', ') || 'N/D'} | Cores: ${
            p.cores?.join(', ') || 'N/D'
          } | Estoque: ${p.quantidade ?? 'N/D'}`
      ).join('\n') || 'Produtos não informados.';

    const profissionaisDetalhados = contextoEstatico.profissionais?.length
      ? contextoEstatico.profissionais
          .map(
            (prof) =>
              `• ${prof.nome} - ${prof.especializacao} (${prof.experiencia}) - ${prof.descricao || 'Sem descrição adicional'}`
          )
          .join('\n')
      : 'Nenhum profissional cadastrado.';

    /* ─── 3. Módulos IA ativos ─── */
    const modulos = contextoEstatico.modulosIA || {};
    const modulosTexto = [
      `Sugestão de produtos: ${modulos.sugestaoProdutos ? 'Sim' : 'Não'}`,
      `Promoções automáticas: ${modulos.promoAuto ? 'Sim' : 'Não'}`,
      `Resumo de pedidos: ${modulos.resumoPedido ? 'Sim' : 'Não'}`,
      `Resposta a links: ${modulos.respostaLink ? 'Sim' : 'Não'}`
    ].join('\n');

    /* ─── 4. Focos temporários ─── */
    let focoAtual = {};
    try {
      const nomeArquivo = cliente.nomeArquivo || 'cliente';
      focoAtual = await storeAdapter.getFocosValidos(nomeArquivo) || {};
    } catch (e) {
      console.warn('⚠️ Erro ao carregar focos:', e.message);
      focoAtual = { focos: {} };
    }
    if (!focoAtual.focos) focoAtual.focos = {};

    const blocosFoco = [];

    // 🛍️ produto (compat: v2.x e v3.x)
    if (Array.isArray(focoAtual.focos.produto) && focoAtual.focos.produto.length) {
      blocosFoco.push(
        '🛍️ Interesse atual em produtos:\n' +
          focoAtual.focos.produto
            .map((p) => {
              const nome = p.nome || p.item || 'produto';
              const cores = p.coresMencionadas || p.cores || [];
              const tamanhos = p.tamanhosMencionados || p.tamanhos || [];
              const intencao = p.intencao || 'interesse';
              return `• ${nome} (Cores: ${cores.length ? cores.join(', ') : 'N/D'}, Tamanhos: ${tamanhos.length ? tamanhos.join(', ') : 'N/D'}, Intenção: ${intencao})`;
            })
            .join('\n')
      );
    }

    // 💆 servico (se existir no seu foco antigo)
    if (Array.isArray(focoAtual.focos.servico) && focoAtual.focos.servico.length) {
      blocosFoco.push(
        '💆 Serviços mencionados:\n' +
          focoAtual.focos.servico
            .map((s) => `• ${s.nome || 'serviço'} ${s.pacote ? `(${s.pacote})` : ''} - Intenção: ${s.intencao || 'interesse'}`)
            .join('\n')
      );
    }

    // 📅 agendamento (compat: v2.x e v3.x)
    if (Array.isArray(focoAtual.focos.agendamento) && focoAtual.focos.agendamento.length) {
      blocosFoco.push(
        '📅 Tentativas de agendamento:\n' +
          focoAtual.focos.agendamento
            .map((a) => {
              const servico = a.servicoRelacionado || a.servico || a.nome || 'N/D';
              const data = a.data || a.dataDesejada || 'N/D';
              const hora = a.hora || a.horario || 'N/D';
              const regiao = a.regiao || a.zona || a.bairro || a.area || 'N/D';
              const confirmado = a.confirmado ? 'Sim' : 'Não';
              return `• Serviço: ${servico} | Data: ${data} | Hora: ${hora} | Região: ${regiao} | Confirmado: ${confirmado}`;
            })
            .join('\n')
      );
    }

    // ❓ dúvidas
    if (Array.isArray(focoAtual.focos.duvidasRecentes) && focoAtual.focos.duvidasRecentes.length) {
      blocosFoco.push(
        '❓ Dúvidas recentes do cliente:\n' +
          focoAtual.focos.duvidasRecentes.slice(-3).map((d) => `• ${d}`).join('\n')
      );
    }

    // 📇 contato
    if (focoAtual.focos.contatoCliente && (focoAtual.focos.contatoCliente.nome || focoAtual.focos.contatoCliente.telefone)) {
      blocosFoco.push(
        `📇 Contato capturado:\n• Nome: ${focoAtual.focos.contatoCliente.nome || 'N/D'} | Telefone: ${focoAtual.focos.contatoCliente.telefone || 'N/D'}`
      );
    }

    const blocoFocos = blocosFoco.length
      ? `\n🔎 CONTEXTO TEMPORÁRIO ATUAL (IA pode considerar para responder):\n${blocosFoco.join('\n\n')}`
      : '';

    /* ─── 5. Histórico Inteligente ─── */
    const historicoRecente = obterHistoricoRecente(cliente);
    const resumoHistorico = gerarResumoHistorico(cliente, opcoes.contexto?.ultimasInteracoes || []);

    /* ─── 5. Capítulo e Variáveis ─── */
    let blocoCapitulo = '';
    try {
      const capituloAtual = carregarCapituloAtual(cliente.nomeArquivo || 'cliente');
      if (capituloAtual?.capituloAtual) {
        blocoCapitulo = `\n🧩 CAPÍTULO ATUAL DA CONVERSA\n• Título: ${capituloAtual.capituloAtual}\n• Motivo que iniciou: ${capituloAtual.motivo || 'Não informado'}`;
      }
    } catch (e) {
      console.warn('⚠️ Erro ao carregar capítulo:', e.message);
    }

    let blocoVariaveis = '';
    try {
      const vars = getVariaveisValidas(cliente.nomeArquivo || 'cliente');
      const chaves = Object.keys(vars || {});
      if (chaves.length) {
        blocoVariaveis =
          '\n\n🧠 VARIÁVEIS SEMÂNTICAS ATIVAS\n' +
          chaves.map((k) => `• ${k}: ${vars[k]}`).join('\n');
      }
    } catch (e) {
      console.warn('⚠️ Erro ao carregar variáveis:', e.message);
    }

      /* ─── 6. Montagem Final do Prompt ─── */
    
    // 🎭 GERAR PERSONALIDADE VENDEDORA GLOBAL
    const personalidadeVendedora = gerarPersonalidadeVendedora(cliente);
    const memoriaEmocional = obterMemoriaEmocional(cliente);
    
                // 🎯 GERAR ESTADO DO FUNIL DE VENDAS GLOBAL
            const estadoFunil = obterEstadoFunil(cliente);
            const proximaAcaoFunil = obterProximaAcao(cliente, estadoFunil);
            const gatilhosFunil = gerarGatilhosEtapa(cliente, estadoFunil);

            // 🧠 GERAR ANÁLISE DE GATILHOS MENTAIS GLOBAL
            const historicoGatilhos = obterHistoricoGatilhos(cliente);
            const eficaciaGatilhos = analisarEficaciaGatilhos(cliente);

            // 🎯 GERAR ANÁLISE DE FECHAMENTO ASSERTIVO GLOBAL (comentado por enquanto)
            // const historicoFechamentos = obterHistoricoFechamentos(cliente);
            // const eficaciaFechamentos = analisarEficaciaFechamentos(cliente);
            // const sinaisProntidao = detectarSinaisProntidao(cliente, { memoriaEmocional, estadoFunil });
  
    const prompt = `
  Você é ${cliente.nomeBot || 'Luni'}, uma assistente virtual comercial inteligente que representa o negócio do cliente. Seu objetivo é ajudar a converter vendas ou agendar serviços, respeitando o estilo e segmento do cliente.

  🔄 ESTADO DA CONVERSA
  Esta é uma conversa contínua. Só use saudação se "primeiraInteracao" for verdadeira. Em qualquer outra situação, responda de forma fluida e direta, sem saudações, cumprimentos ou frases de abertura.

  🧍 USO DO NOME DO CLIENTE
  Se o nome do cliente foi informado e está salvo, não pergunte novamente. Use com naturalidade (ex: "Legal, Davi! Já te explico..."). Evite repetir o nome em todo turno.

  📌 CONTEXTO ATUAL DA INTERAÇÃO
  * Primeira interação da sessão: ${primeiraInteracao ? 'Sim' : 'Não'}
  * Período do dia detectado: ${periodoDia || 'Não identificado'}
  * Tipo de mensagem recebida: ${tipoMensagem}
  ${blocoFocos}${blocoCapitulo}${blocoVariaveis}${resumoHistorico}${historicoRecente}

  📌 INFORMAÇÕES DO NEGÓCIO
  * Nome do negócio: ${contextoEstatico.nome}
  * Segmento: ${segmento}
  * Subsegmento: ${cliente.subSegmento || 'N/D'}
  * Produtos/Serviços principais: ${cliente.produto || 'N/D'}
  * Produtos detalhados:
  ${produtosDetalhados}

  * Diferenciais do negócio: ${contextoEstatico.diferencial || 'Não especificado'}
  * Promoções: ${contextoEstatico.promocoes || 'Nenhuma ativa'}
  * Link para produtos/site: ${cliente.linkProdutos || 'Não informado'}
  * Canais de atendimento: ${cliente.canaisAtendimento?.join(', ') || 'N/D'}
  * Funcionamento: ${contextoEstatico.funcionamento || 'Não informado'}
  * Pausas: ${cliente.pausas || 'Nenhuma'}
  * Atendimento fora do horário: ${cliente.respondeForaHorario ? 'Sim' : 'Não'}

  👥 PÚBLICO E COMUNICAÇÃO
  * Público-alvo: ${contextoEstatico.publicoAlvo || 'Não especificado'}
  * Dores dos clientes: ${contextoEstatico.dorCliente || 'Não informado'}
  * Linguagem: ${contextoEstatico.linguagem || 'Não especificada'} | Emojis: ${contextoEstatico.emojis || 'Não especificado'} | Respostas: ${cliente.respostasDetalhadas || 'Não especificado'}
  * Frase padrão: "${contextoEstatico.frasePadrao || 'Olá, posso te ajudar?'}"
  * Frases sugeridas: ${(cliente.frasesSugestivas || []).join(', ') || 'Nenhuma'}
  * Tons preferidos: ${(contextoEstatico.tonsPreferidos || []).join(', ') || 'Não definido'}
  * Termos proibidos: ${(contextoEstatico.termosProibidos || []).join(', ') || 'Nenhum'}
  * Temas sensíveis a evitar: ${(cliente.temasSensiveis || []).join(', ') || 'Nenhum'}
  * Nome do bot: ${cliente.nomeBot || 'Luni'}
  * Usar nome do negócio nas respostas: ${cliente.usarNomeNegocio ? 'Sim' : 'Não'}

  �� COMPORTAMENTO DE VENDAS CONFIGURADO
  * Intensidade configurada: ${contextoEstatico.intensidadeVendas || 2}
  ${comportamentoIntensidade}

  🎭 PERSONALIDADE VENDEDORA GLOBAL
  * Estilo: ${personalidadeVendedora.estilo}
  * Humor: ${personalidadeVendedora.humor}
  * Energia: ${personalidadeVendedora.energia}
  * Especialidade: ${personalidadeVendedora.especialidade}
  * Tom: ${personalidadeVendedora.tom}
  * Abordagem: ${personalidadeVendedora.abordagem}
  * Gatilhos preferidos: ${personalidadeVendedora.gatilhosPreferidos.join(', ')}

  🧠 MEMÓRIA EMOCIONAL DO CLIENTE
  * Nível de confiança: ${(memoriaEmocional.confianca * 100).toFixed(0)}%
  * Urgência: ${(memoriaEmocional.urgencia * 100).toFixed(0)}%
  * Objeções ativas: ${memoriaEmocional.objeções.length > 0 ? memoriaEmocional.objeções.join(', ') : 'Nenhuma'}
  * Interesses detectados: ${memoriaEmocional.interesses.length > 0 ? memoriaEmocional.interesses.join(', ') : 'Nenhum'}
  * Gatilhos que funcionaram: ${memoriaEmocional.gatilhosFuncionaram.length > 0 ? memoriaEmocional.gatilhosFuncionaram.join(', ') : 'Nenhum'}

              🎯 FUNIL DE VENDAS INTELIGENTE GLOBAL
            * Etapa atual: ${estadoFunil.etapaAtual}
            * Progresso no funil: ${estadoFunil.progresso}%
            * Tempo na etapa: ${Math.round(estadoFunil.tempoNaEtapa / 60)}min
            * Indicadores detectados: ${estadoFunil.indicadoresDetectados.length > 0 ? estadoFunil.indicadoresDetectados.join(', ') : 'Nenhum'}
            * Próxima ação: ${proximaAcaoFunil ? proximaAcaoFunil.acao : 'Não definida'}
            * Gatilhos da etapa: ${gatilhosFunil.length > 0 ? gatilhosFunil.map(g => g.tipo).join(', ') : 'Nenhum'}

            🧠 GATILHOS MENTAIS AVANÇADOS GLOBAL
            * Gatilhos aplicados: ${historicoGatilhos.gatilhos.length > 0 ? historicoGatilhos.gatilhos.slice(-3).map(g => g.tipo).join(', ') : 'Nenhum'}
            * Mais eficazes: ${Object.keys(eficaciaGatilhos.eficaciaEstimada).length > 0 ? Object.entries(eficaciaGatilhos.eficaciaEstimada).sort(([,a], [,b]) => b.intensidadeMedia - a.intensidadeMedia).slice(0, 2).map(([tipo, dados]) => `${tipo} (${(dados.intensidadeMedia * 100).toFixed(0)}%)`).join(', ') : 'Nenhum'}
            * Recomendações: ${eficaciaGatilhos.recomendacoes.length > 0 ? eficaciaGatilhos.recomendacoes.join('; ') : 'Nenhuma'}

            🎯 FECHAMENTO ASSERTIVO GLOBAL (desabilitado temporariamente)
            * Sistema de fechamento assertivo em desenvolvimento

⚙️ FUNCIONALIDADES ATIVADAS
${modulosTexto}

  📅 COMPORTAMENTO DE AGENDAMENTO
  * Deve perguntar nome antes de agendar: ${cliente.perguntarNomeCliente ? 'Sim' : 'Não'}
  * Deve coletar telefone/email: ${cliente.coletarContato ? 'Sim' : 'Não'}
  * Tipo de agendamento: ${contextoEstatico.tipoAgendamento || 'manual'}
  * E-mail do Google Calendar: ${cliente.emailGoogleCalendar || 'N/D'}

🛠️ PERSONALIZAÇÃO ADICIONAL
${cliente.personalizacaoExtra || 'Nenhuma observação personalizada adicionada.'}

👨‍⚕️ EQUIPE DE PROFISSIONAIS
${profissionaisDetalhados}

⚠️ REGRAS DE COMPORTAMENTO GERAIS
* Nunca repita saudações como "Olá", "Oi", "Fala meu parceiro", "Bem-vinda", etc., após a primeira interação.
* Use o tom adequado ao cliente, mas com variedade e fluidez.
* Use storytelling e gatilhos mentais quando fizer sentido.
* Confirme agendamentos com frases claras como "confirmado para", "horário marcado", etc.
* Não peça informações já fornecidas.
* Mantenha a conversa leve, respeitosa e comercial.

🎭 INSTRUÇÕES DE PERSONALIDADE VENDEDORA
* ADAPTE sua personalidade baseada no estilo configurado (${personalidadeVendedora.estilo}).
* Use energia ${personalidadeVendedora.energia} e tom ${personalidadeVendedora.tom}.
* Foque na especialidade: ${personalidadeVendedora.especialidade}.
* Use gatilhos mentais: ${personalidadeVendedora.gatilhosPreferidos.join(', ')}.
* Se confiança < 30%, use linguagem mais suave e tranquilizadora.
* Se há objeções (${memoriaEmocional.objeções.join(', ')}), seja mais persuasivo.
* Se há interesses (${memoriaEmocional.interesses.join(', ')}), explore e conduza.
* Use gatilhos que funcionaram anteriormente: ${memoriaEmocional.gatilhosFuncionaram.join(', ')}.

            🎯 INSTRUÇÕES DE FUNIL DE VENDAS INTELIGENTE
            * Você está na etapa: ${estadoFunil.etapaAtual} (${estadoFunil.progresso}% do funil).
            * CONDUZA ativamente o cliente para a próxima etapa do funil.
            * Use a próxima ação: ${proximaAcaoFunil ? proximaAcaoFunil.acao : 'Não definida'}.
            * Aplique gatilhos da etapa: ${gatilhosFunil.length > 0 ? gatilhosFunil.map(g => g.tipo).join(', ') : 'Nenhum'}.
            * Se detectou indicadores: ${estadoFunil.indicadoresDetectados.join(', ') || 'Nenhum'}, use-os para avançar.
            * Se tempo na etapa > 10min, seja mais direto e objetivo.
            * SEMPRE conduza o cliente para o fechamento de forma natural.

            🧠 INSTRUÇÕES DE GATILHOS MENTAIS AVANÇADOS
            * Use gatilhos mentais de forma NATURAL e CONTEXTUAL.
            * Aplique urgência quando cliente tem pressa ou está no final do funil.
            * Use escassez para criar senso de oportunidade única.
            * Aplique prova social quando há objeções ou baixa confiança.
            * Use autoridade para clientes técnicos ou com baixa confiança.
            * Aplique exclusividade para segmentos premium ou emocionais.
            * Use reciprocidade oferecendo algo primeiro (consulta gratuita).
            * Aplique compromisso pedindo confirmações pequenas.
            * Foque nos gatilhos mais eficazes: ${Object.keys(eficaciaGatilhos.eficaciaEstimada).length > 0 ? Object.entries(eficaciaGatilhos.eficaciaEstimada).sort(([,a], [,b]) => b.intensidadeMedia - a.intensidadeMedia).slice(0, 2).map(([tipo]) => tipo).join(', ') : 'Nenhum'}.
            * SEMPRE seja persuasivo mas respeitoso, nunca agressivo.

            🎯 INSTRUÇÕES DE FECHAMENTO ASSERTIVO
            * SEMPRE conduza o cliente para o fechamento de forma NATURAL.
            * Use fechamento direto quando cliente está 80%+ no funil: "Vamos agendar agora?"
            * Use fechamento assumptivo quando cliente demonstra interesse: "Perfeito! Vou preparar tudo."
            * Use fechamento por interesse baseado nos interesses detectados: Sim.
            * Use fechamento por urgência quando cliente tem pressa: Sim.
            * Use fechamento agressivo apenas para clientes com alta intensidade de vendas.
            * Use fechamento por objeção quando há objeções ativas: Sim.
            * Adicione call-to-action contextual baseado na etapa do funil.
            * Aplique urgência final quando apropriado (últimas vagas, oferta limitada).
            * SEMPRE seja assertivo mas respeitoso, nunca pressione demais.

${basePrompt}
`.trim();

    /* ─── 7. Otimização de Contexto ─── */
    const targetTokensIn = opcoes.targetTokensIn || 5000;
    const promptOtimizado = otimizarContexto(prompt, targetTokensIn);

    /* ─── 8. Log final do prompt (preview) ─── */
    debugLog('promptBuilder > prompt gerado', {
      cliente: cliente.nomeArquivo,
      comprimento: promptOtimizado.length,
      preview: promptOtimizado.slice(0, 180),
      targetTokensIn
    });

    return promptOtimizado;
  } catch (e) {
    console.error('❌ Erro inesperado no promptBuilder:', e);
    return `Erro inesperado: ${e.message}`;
  }
}
