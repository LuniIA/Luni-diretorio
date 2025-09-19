// apresentacaoBot.js
// Sistema de apresentação modular da IA Luni

const TEMPLATES_APRESENTACAO = {
  barbearia: "Fala, {cargoBot}! Sou o {nomeBot} da {empresa} 💈 Como posso te ajudar hoje?",
  estetica_facial_corporal: "Oi, linda! Sou a {nomeBot}, {cargoBot} da {empresa} ✨ Como posso te ajudar hoje?",
  estetica_emocional: "Oi, querida! Sou a {nomeBot}, {cargoBot} da {empresa} 💕 Como posso te ajudar hoje?",
  bemestar_massoterapia: "Olá! Sou a {nomeBot}, {cargoBot} da {empresa} 🌿 Como posso te ajudar hoje?",
  intimidade_bemestar: "Oi! Sou a {nomeBot}, {cargoBot} da {empresa} 💜 Como posso te ajudar hoje?",
  moda_feminina: "Oi, linda! Sou a {nomeBot}, {cargoBot} da {empresa} 👗 Como posso te ajudar hoje?",
  servicos_tecnologicos: "Olá! Sou o {nomeBot}, {cargoBot} da {empresa} 💻 Como posso te ajudar hoje?",
  servicos_gerais: "Oi! Sou a {nomeBot}, {cargoBot} da {empresa} ⚙️ Como posso te ajudar hoje?",
  ecommerce_ativo: "Oi! Sou a {nomeBot}, {cargoBot} da {empresa} 🛒 Como posso te ajudar hoje?",
  servicosgraficos: "Oi! Sou a {nomeBot}, {cargoBot} da {empresa} 🎨 Como posso te ajudar hoje?",
  padrao: "Oi! Sou a {nomeBot}, {cargoBot} da {empresa}. Como posso te ajudar hoje?"
};

/**
 * Processa template substituindo variáveis
 */
const processarTemplate = (template, cliente) => {
  return template
    .replace(/{nomeBot}/g, cliente.apresentacaoBot?.nomeBot || cliente.nomeBot || 'Luni')
    .replace(/{cargoBot}/g, cliente.apresentacaoBot?.cargoBot || 'atendente')
    .replace(/{empresa}/g, cliente.nome);
};

/**
 * Gera apresentação personalizada da IA Luni
 */
export const gerarApresentacao = (cliente) => {
  // Se tem apresentação customizada, usa ela
  if (cliente.apresentacaoBot?.customizada) {
    return processarTemplate(cliente.apresentacaoBot.customizada, cliente);
  }
  
  // Se tem template específico, usa ele
  if (cliente.apresentacaoBot?.template) {
    const template = TEMPLATES_APRESENTACAO[cliente.apresentacaoBot.template];
    if (template) {
      return processarTemplate(template, cliente);
    }
  }
  
  // Fallback: detecta segmento automaticamente
  const segmento = cliente.segmento || 'padrao';
  const template = TEMPLATES_APRESENTACAO[segmento] || TEMPLATES_APRESENTACAO.padrao;
  return processarTemplate(template, cliente);
};

export default { gerarApresentacao };

