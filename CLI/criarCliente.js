
// criarCliente.js v1.7 – Atualizado com agendamento Google Calendar, Link Inteligente e Planos
import fs from 'fs';
import readline from 'readline';
import path from 'path';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const respostas = {};

function perguntar(texto, chave, transformador = (x) => x) {
  return new Promise((resolve) => {
    rl.question(`🟣 ${texto}\n> `, (resposta) => {
      respostas[chave] = transformador(resposta);
      resolve();
    });
  });
}

function slugify(texto) {
  return texto.toLowerCase().replace(/\s+/g, '').replace(/[^\w\-]/g, '');
}

async function iniciar() {
  console.log("\n🛠️ Iniciando criação de cliente para Luni (v1.7)\n");

  // Bloco 1 – Identificação
  await perguntar("Nome do seu negócio", "nome");
  respostas.nomeArquivo = slugify(respostas.nome);
  
  // Plano com explicação
  console.log("\n📊 Escolha o plano do cliente:");
  console.log("• basico: Conversas simples (2.5k tokens entrada, 600 saída)");
  console.log("• pro: Vendas consultivas (4k tokens entrada, 800 saída)");
  console.log("• enterprise: Negociações complexas (6k tokens entrada, 1000 saída)");
  await perguntar("Plano do cliente (basico/pro/enterprise)", "plano", r => r.toLowerCase());

  // Bloco 2 – Segmento
  await perguntar("Segmento principal (ex: moda, estetica, barbearia)", "segmento");
  await perguntar("Subsegmento (ex: loja online de roupas femininas)", "subSegmento");

  // Bloco 3 – Produtos e serviços
  await perguntar("Descrição do que você vende ou oferece", "produto");
  respostas.produtosServicos = []; // simplificado para manter foco

  await perguntar("Serviços com preços fixos? (ex: Corte: R$30)", "servicosComPrecoFixo", r => r.split(',').map(e => e.trim()));
  await perguntar("Deseja exibir preços no bot? (sim/não)", "exibirPrecosBot", r => r.toLowerCase().includes('s') ? "Sim" : "Não");

  // Bloco 4 – Vendas e comportamento
  await perguntar("Intensidade de vendas (1=Informativo, 2=Consultivo, 3=Ativo)", "intensidadeVendas", r => parseInt(r));
  await perguntar("Quais estratégias de venda se aplicam? (ex: SPIN, urgência, desejo)", "estrategiaVendas", r => r.split(',').map(e => e.trim()));
  await perguntar("Foco atual de vendas", "focoVendas");
  await perguntar("Promoções ativas (ou 'nenhuma')", "promocoes");

  // Bloco 5 – Estilo de linguagem
  await perguntar("Tom geral da linguagem (ex: empática, direta)", "linguagem");
  await perguntar("Tons preferidos (ex: otimista, acolhedor)", "tonsPreferidos", r => r.split(',').map(e => e.trim()));
  await perguntar("Frases sugeridas (ex: Oi linda!, Chegou novidade!)", "frasesSugestivas", r => r.split(',').map(e => e.trim()));
  await perguntar("Detalhamento das respostas (curta, média, longa)", "respostasDetalhadas");
  await perguntar("Deseja que o bot use emojis? (sim/não)", "emojis", r => r.toLowerCase().includes('s') ? "Sim" : "Não");
  await perguntar("Frase padrão de boas-vindas (opcional)", "frasePadrao");
  await perguntar("Termos proibidos (ex: barato, problema)", "termosProibidos", r => r.split(',').map(t => t.trim()));
  await perguntar("Temas sensíveis a evitar? (ex: idade, peso)", "temasSensiveis", r => r.split(',').map(t => t.trim()));

  // Bloco 6 – Atendimento e funcionamento
  await perguntar("Horários de funcionamento", "funcionamento");
  await perguntar("Bot responde fora do horário? (sim/não)", "respondeForaHorario", r => r.toLowerCase().includes('s'));
  await perguntar("Há pausas (ex: almoço)?", "pausas");
  await perguntar("Seu negócio é físico, online ou ambos?", "tipoNegocio");
  await perguntar("Atendimento local? (descreva)", "atendimentoLocal");
  await perguntar("Canais de atendimento (separar por vírgula)", "canaisAtendimento", r => r.split(',').map(c => c.trim()));
  await perguntar("Tempo de mercado", "tempoMercado");
  await perguntar("Informação inicial que o bot deve perguntar?", "infoEspecificaInicio");

  // Bloco 7 – Público e dores
  await perguntar("Público-alvo", "publicoAlvo");
  await perguntar("Principais dúvidas dos clientes?", "principaisDuvidas", r => r.split(',').map(d => d.trim()));
  await perguntar("Principal dor ou problema que você resolve", "dorCliente");

  // Bloco 8 – Agendamento (atualizado)
  await perguntar("Deseja ativar agendamento local? (sim/não)", "agendamentoLocal", r => r.toLowerCase().includes('s'));

  await perguntar("Deseja usar Google Calendar para agendamento? (sim/não)", "usaGoogleCalendar", r => r.toLowerCase().includes('s'));
  if (respostas.usaGoogleCalendar) {
    await perguntar("E-mail do Google Calendar", "emailGoogleCalendar");
  }

  await perguntar("Você usa algum link de agendamento online? (ex: Calendly)", "temLinkAgendamento", r => r.toLowerCase().includes('s'));
  if (respostas.temLinkAgendamento) {
    await perguntar("Cole aqui o link do seu agendamento:", "linkAgendamentoInteligente");
  }

  // Define tipoAgendamento com base nas escolhas
  if (respostas.usaGoogleCalendar) {
    respostas.tipoAgendamento = "googleCalendar";
  } else if (respostas.linkAgendamentoInteligente) {
    respostas.tipoAgendamento = "linkInteligente";
  } else if (respostas.agendamentoLocal) {
    respostas.tipoAgendamento = "manual";
  } else {
    respostas.tipoAgendamento = null;
  }

  // Bloco 9 – Personalização e extras
  await perguntar("Deseja que o bot pergunte o nome do cliente? (sim/não)", "perguntarNomeCliente", r => r.toLowerCase().includes('s'));
  await perguntar("Deseja que o bot colete contato (tel/email)? (sim/não)", "coletarContato", r => r.toLowerCase().includes('s'));
  await perguntar("Deseja usar o nome do negócio nas mensagens? (sim/não)", "usarNomeNegocio", r => r.toLowerCase().includes('s'));
  await perguntar("Nome do bot (opcional)", "nomeBot");
  await perguntar("Objetivo principal do bot", "objetivoBot");
  await perguntar("Personalização extra (opcional)", "personalizacaoExtra");

  // Bloco 10 – Interno
  await perguntar("Observações gerais importantes", "observacoes");
  await perguntar("Referências (concorrentes ou inspirações)", "referencias", r => r.split(',').map(ref => ref.trim()));
  await perguntar("Pronto para configurar? (sim/não)", "prontoParaConfigurar", r => r.toLowerCase().includes('s') ? "Sim" : "Não");

  await salvarArquivo();
  rl.close();
}

function prompt(texto) {
  return new Promise((resolve) => rl.question(`> ${texto} `, resolve));
}

async function salvarArquivo() {
  const nomeCliente = respostas.nomeArquivo;
  const caminho = path.resolve('../clientes', `${nomeCliente}.json`);

  fs.writeFileSync(caminho, JSON.stringify(respostas, null, 2), 'utf-8');
  console.log(`\n✅ Cliente salvo com sucesso como: clientes/${nomeCliente}.json`);
  console.log(`📊 Plano configurado: ${respostas.plano}`);
}

iniciar();
