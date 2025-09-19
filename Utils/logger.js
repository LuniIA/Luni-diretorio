import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import pino from 'pino';

function garantirPasta(caminho) {
  if (!fs.existsSync(caminho)) {
    fs.mkdirSync(caminho, { recursive: true });
  }
}

// Logger global (console/file via pino)
const baseLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty' }
});

function getCaminhoLog(cliente) {
  garantirPasta('./historico');
  const nome = cliente?.nomeArquivo || 'cliente';
  return path.join('./historico', `${nome}_log.txt`);
}

export async function logEntrada(cliente, mensagem) {
  try {
    const log = `>>> [ENTRADA] ${new Date().toISOString()} | Msg: ${mensagem}\n`;
    await fsPromises.appendFile(getCaminhoLog(cliente), log, 'utf-8');
  } catch {}
  baseLogger.info({ evt: 'entrada', cliente: cliente?.nomeArquivo || 'cliente', mensagem });
}

export async function logSaida(cliente, conteudo, tempoMs = null, meta = {}) {
  try {
    const tempoTexto = tempoMs ? ` | Tempo: ${tempoMs}ms` : '';
    const log = `<<< [RESPOSTA] ${new Date().toISOString()}${tempoTexto} | Resp: ${conteudo}\n`;
    await fsPromises.appendFile(getCaminhoLog(cliente), log, 'utf-8');
  } catch {}
  baseLogger.info({ evt: 'resposta', cliente: cliente?.nomeArquivo || 'cliente', tempoMs, ...meta });
}

export async function logErro(cliente, erro) {
  try {
    const log = `!!! [FALHA] ${new Date().toISOString()} | Erro: ${erro?.message || erro}\n`;
    await fsPromises.appendFile(getCaminhoLog(cliente), log, 'utf-8');
  } catch {}
  baseLogger.error({ evt: 'erro', cliente: cliente?.nomeArquivo || 'cliente', erro: erro?.message || String(erro) });
}

export async function logAgendamento(cliente, conteudo) {
  garantirPasta('./agendamentos');
  const nome = cliente?.nomeArquivo || 'cliente';
  const nomeNegocio = cliente?.nome || 'Negócio não identificado';
  const caminho = path.join('./agendamentos', `${nome}_agendamentos.txt`);
  const log = `[${new Date().toLocaleString()}] [${nomeNegocio}] ${conteudo}\n`;
  try {
    await fsPromises.appendFile(caminho, log, 'utf-8');
  } catch {}
  baseLogger.info({ evt: 'agendamento', cliente: nome, negocio: nomeNegocio });
}
