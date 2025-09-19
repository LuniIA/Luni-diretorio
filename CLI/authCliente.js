// authCliente.js v1.1 – Autenticação Google Calendar com suporte à pasta config/

import fs from 'fs';
import path from 'path';
import { authenticate } from '@google-cloud/local-auth';
import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/calendar'];

function getTokenPath(nomeArquivo) {
  return path.join(process.cwd(), `token_${nomeArquivo}.json`);
}

async function autenticarCliente(nomeArquivo = 'cliente') {
  const credentialPath = path.join(process.cwd(), 'config', 'credentials.json'); // atualizado
  const tokenPath = getTokenPath(nomeArquivo);

  const auth = await authenticate({
    scopes: SCOPES,
    keyfilePath: credentialPath,
  });

  const token = auth.credentials;
  fs.writeFileSync(tokenPath, JSON.stringify(token));
  console.log(`✅ Token gerado e salvo para: ${nomeArquivo} -> ${tokenPath}`);

  // (Opcional) Verifica acesso ao Calendar com sucesso
  const calendar = google.calendar({ version: 'v3', auth });
  const res = await calendar.calendarList.list();
  const lista = res.data.items.map(cal => `- ${cal.summary}`).join('\n');
  console.log(`📅 Acesso confirmado. Calendários disponíveis:\n${lista}`);
}

// 🔁 Execução direta via terminal
const args = process.argv.slice(2);
const nomeArquivo = args[0] || 'cliente';
autenticarCliente(nomeArquivo).catch(console.error);
