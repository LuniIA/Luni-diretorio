// core/agendamentoStrategy.js v1.1 – Estratégias de agendamento por tipo, agora com debugLog

import { parseDataHora } from '../Utils/unified.js';
import { criarEventoSimples } from './calendarIntegration.js';
import { temLinkDeAgendamento } from '../Utils/unified.js';
import { debugLog } from '../Utils/debugLog.js';   // <-- helper de log

export async function executarEstrategiaAgendamento(cliente, mensagem) {
  const tipo = cliente.tipoAgendamento || 'manual';
  debugLog('agendamentoStrategy > executar', { cliente: cliente.nomeArquivo, tipo });

  switch (tipo) {
    case 'googleCalendar':
      return await usarGoogleCalendar(cliente, mensagem);
    case 'linkInteligente':
      return await enviarLinkAgendamento(cliente);
    default:
      return respostaManual(cliente);
  }
}

/* ───────── Estratégia Google Calendar ───────── */
async function usarGoogleCalendar(cliente, mensagem) {
  if (!cliente.emailGoogleCalendar) {
    debugLog('agendamentoStrategy > googleCalendar sem email', { cliente: cliente.nomeArquivo });
    return respostaManual(cliente);
  }

  try {
    const { data, hora } = parseDataHora(mensagem);
    debugLog('agendamentoStrategy > googleCalendar parseado', { data, hora });

    const resultado = await criarEventoSimples({
      resumo: `Agendamento via Luni - ${cliente.nome}`,
      data,
      hora,
      cliente
    });

    return {
      sucesso: true,
      tipo: 'google',
      mensagem: `✅ Seu horário foi agendado com sucesso. Você receberá um lembrete automático.`,
      debug: resultado
    };
  } catch (erro) {
    console.warn('⚠️ Erro ao criar evento Google Calendar:', erro.message);
    debugLog('agendamentoStrategy > erro Google', { erro: erro.message });
    return respostaManual(cliente);
  }
}

/* ───────── Estratégia Link Inteligente ───────── */
function enviarLinkAgendamento(cliente) {
  if (!temLinkDeAgendamento(cliente)) {
    debugLog('agendamentoStrategy > cliente sem link inteligente', { cliente: cliente.nomeArquivo });
    return respostaManual(cliente);
  }

  debugLog('agendamentoStrategy > link inteligente enviado', { link: cliente.linkAgendamentoInteligente });
  return {
    sucesso: true,
    tipo: 'link',
    mensagem: `✨ Você pode agendar seu horário por aqui: ${cliente.linkAgendamentoInteligente}`
  };
}

/* ───────── Fallback manual ───────── */
function respostaManual(cliente) {
  debugLog('agendamentoStrategy > fallback manual', { cliente: cliente.nomeArquivo });
  return {
    sucesso: true,
    tipo: 'manual',
    mensagem: `📌 Anotei seu pedido. Nossa equipe vai confirmar com você pelo WhatsApp!`
  };
}
