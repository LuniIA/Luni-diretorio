// core/agendamento.js v2.1 – Orquestrador de estratégias de agendamento com logs internos

import fs from 'fs';
import fsPromises from 'fs/promises';
import { removerFocoPorCategoria } from '../focos/helpers/focoManager.js';
import { executarEstrategiaAgendamento } from './agendamentoStrategy.js';
import { debugLog } from '../Utils/debugLog.js'; // caminho ajustável conforme sua estrutura

// Regex local (mantido aqui porque só esse módulo usa)
const REGEX_CONFIRMACAO = /\b(agendado|reserva confirmada|agendamento confirmado|horário confirmado|reservado|marcado|tá marcado|confirmado para|confirmado às|confirmado no|confirmado)\b/i;

export async function registrarAgendamento(resposta, mensagem, cliente) {
  const nomeArquivo = cliente.nomeArquivo || 'cliente';
  const nomeNegocio = cliente.nome || 'Negócio não identificado';

  debugLog('agendamento > entrada', { cliente: nomeArquivo, mensagem, resposta });

  // 1. Verifica se há confirmação na resposta
  if (!REGEX_CONFIRMACAO.test(resposta)) {
    debugLog('agendamento > sem confirmação detectada');
    return { sucesso: false, motivo: 'sem_confirmacao' };
  }

  // 2. Registra no log local (arquivo)
  const caminhoAgendamento = `./agendamentos/${nomeArquivo}_agendamentos.txt`;
  const logAgendamento = `[${new Date().toLocaleString()}] [${nomeNegocio}] ${resposta}\n`;

  if (!fs.existsSync('./agendamentos')) {
    fs.mkdirSync('./agendamentos');
    debugLog('agendamento > pasta criada', { path: './agendamentos' });
  }

  try {
    await fsPromises.appendFile(caminhoAgendamento, logAgendamento, 'utf-8');
  } catch {}
  console.log(`✅ Agendamento registrado: ${resposta}`);
  debugLog('agendamento > log salvo', { path: caminhoAgendamento });

  // 3. Remove foco anterior de tentativa de agendamento
  await removerFocoPorCategoria(nomeArquivo, 'agendamento');
  debugLog('agendamento > foco "agendamento" removido');

  // 4. Executa estratégia de agendamento (google/link/manual)
  try {
    const resultado = await executarEstrategiaAgendamento(cliente, mensagem);
    debugLog('agendamento > estratégia executada com sucesso', resultado);
    return resultado;
  } catch (erro) {
    console.warn("⚠️ Erro ao executar estratégia de agendamento:", erro.message);
    debugLog('agendamento > erro na estratégia', { erro: erro.message });

    return {
      sucesso: false,
      tipo: 'erro',
      mensagem: "⚠️ Tivemos uma instabilidade ao tentar registrar seu horário. Vamos confirmar manualmente."
    };
  }
}
