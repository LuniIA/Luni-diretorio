// responseHelper.js v3.2 – Geração de resposta a links com logs de intensidade

import { debugLog } from '../Utils/debugLog.js';
import { detectarLink, escolhaAleatoria } from './unified.js';

export function gerarRespostaLink(cliente) {
  const intensidade = cliente.intensidadeVendas || 2;
  debugLog('responseHelper > gerarRespostaLink', { intensidade });

  if (intensidade === 1) {
    return gerarComportamentoInformativo();
  } else if (intensidade === 3) {
    return gerarComportamentoAtivo();
  } else {
    return gerarComportamentoConsultivo();
  }
}

// 🔵 Estilo 1 — Informativo
function gerarComportamentoInformativo() {
  const respostas = [
    "Recebi o link. Se quiser, posso te explicar mais sobre isso ou tirar dúvidas!",
    "Se precisar de ajuda para entender melhor o que viu, estou por aqui.",
    "Pode me chamar se quiser saber mais ou comparar com outras opções."
  ];
  const resposta = escolhaAleatoria(respostas);
  debugLog('responseHelper > comportamentoInformativo', { resposta });
  return resposta;
}

// 🟠 Estilo 2 — Consultivo
function gerarComportamentoConsultivo() {
  const respostas = [
    "Esse link parece interessante! Quer que eu te mostre algo complementar ou explique melhor?",
    "Se estiver em dúvida, posso te mostrar outras opções parecidas ou te ajudar a decidir.",
    "Muitas pessoas perguntam sobre isso — posso te explicar o que é mais vantajoso nesse caso 😉"
  ];
  const resposta = escolhaAleatoria(respostas);
  debugLog('responseHelper > comportamentoConsultivo', { resposta });
  return resposta;
}

// 🔴 Estilo 3 — Ativo
function gerarComportamentoAtivo() {
  const respostas = [
    "Amei essa escolha! Posso reservar agora mesmo pra você, quer?",
    "Vamos garantir? Esse é um dos mais procurados — posso agilizar aqui rapidinho.",
    "Esse é sucesso de vendas! Posso confirmar pra você agora mesmo."
  ];
  const resposta = escolhaAleatoria(respostas);
  debugLog('responseHelper > comportamentoAtivo', { resposta });
  return resposta;
}

