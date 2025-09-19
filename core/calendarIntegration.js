// calendarIntegration.js v3.1 – Suporte a múltiplos tokens + logs detalhados

import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import { authenticate } from '@google-cloud/local-auth'; // para fluxos de auth guiado
import { debugLog } from '../Utils/debugLog.js';          // ajuste o caminho se necessário

const SCOPES = ['https://www.googleapis.com/auth/calendar'];

/* ───────── helpers ───────── */
function getTokenPath(cliente) {
  const nomeArquivo = cliente.nomeArquivo || 'cliente';
  return path.join(process.cwd(), `token_${nomeArquivo}.json`);
}

/* ───────── autenticação ───────── */
export async function autenticarGoogleCalendar(cliente) {
  const tokenPath = getTokenPath(cliente);
  const credentialPath = path.join(process.cwd(), 'config', 'credentials.json');

  debugLog('calendarIntegration > autenticarGoogleCalendar()', {
    cliente: cliente.nomeArquivo,
    tokenPath,
  });

  if (fs.existsSync(tokenPath)) {
    const credentials = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    const auth = new google.auth.OAuth2();
    auth.setCredentials(credentials);
    debugLog('calendarIntegration > token carregado com sucesso');
    return google.calendar({ version: 'v3', auth });
  }

  console.log(
    `🔐 Nenhum token encontrado para ${cliente.nomeArquivo}. Execute 'node cli/authCliente.js ${cliente.nomeArquivo}' para autenticar.`
  );
  throw new Error('Token de autenticação do Google Calendar não encontrado.');
}

/* ───────── criar evento ───────── */
export async function criarEventoSimples({ resumo, data, hora, cliente, mensagemOriginal = '' }) {
  debugLog('calendarIntegration > criarEventoSimples()', { cliente: cliente.nomeArquivo, data, hora });

  try {
    const calendar = await autenticarGoogleCalendar(cliente);

    if (!data || !hora) {
      throw new Error('Data ou hora não fornecida para criação do evento.');
    }

    const [ano, mes, dia] = data.split('-');
    const [horaInicio, minutoInicio] = hora.split(':');
    const dataInicio = new Date(ano, mes - 1, dia, horaInicio, minutoInicio);
    const dataFim = new Date(dataInicio.getTime() + 30 * 60000);

    const evento = {
      summary: resumo || `Atendimento – ${cliente.nome}`,
      description: `Solicitado via Luni: "${mensagemOriginal}"`,
      start: {
        dateTime: dataInicio.toISOString(),
        timeZone: 'America/Sao_Paulo',
      },
      end: {
        dateTime: dataFim.toISOString(),
        timeZone: 'America/Sao_Paulo',
      },
    };

    const response = await calendar.events.insert({
      calendarId: cliente.emailGoogleCalendar || 'primary',
      requestBody: evento,
    });

    const link = response.data.htmlLink;
    console.log(`✅ Evento criado no Google Calendar: ${link}`);
    debugLog('calendarIntegration > evento criado', { link });

    return {
      sucesso: true,
      eventoId: response.data.id,
      link,
      data,
      hora,
      mensagem: '✅ Agendamento realizado com sucesso!',
    };
  } catch (erro) {
    console.warn('❌ Erro ao criar evento no Google Calendar:', erro.message);
    debugLog('calendarIntegration > erro criar evento', { erro: erro.message });

    if (erro.message.includes('409') || erro.code === 409) {
      return {
        sucesso: false,
        erro: 'Conflito de horário',
        mensagem: '⚠️ Esse horário já está reservado. Quer tentar outro?',
        debug: { data, hora, email: cliente.emailGoogleCalendar },
      };
    }

    return {
      sucesso: false,
      erro: erro.message,
      mensagem: '⚠️ Ocorreu um erro ao tentar criar o evento. Vamos confirmar manualmente.',
      debug: { data, hora, email: cliente.emailGoogleCalendar },
    };
  }
}
