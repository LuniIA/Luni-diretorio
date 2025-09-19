// authServer.js
import express from 'express';
import fs from 'fs';
import path from 'path';
import open from 'open';
import { google } from 'googleapis';
import bodyParser from 'body-parser';

const app = express();
const PORT = 5050;

const SCOPES = ['https://www.googleapis.com/auth/calendar'];
const credentialsPath = path.join(process.cwd(), 'credentials.json');

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Página inicial com formulário simples
app.get('/', (req, res) => {
  res.send(`
    <h2>Conectar Google Calendar à Luni</h2>
    <form action="/auth" method="POST">
      <label>Informe seu nome interno (ex: studioglow):</label><br/>
      <input type="text" name="cliente" required /><br/><br/>
      <button type="submit">Conectar com Google</button>
    </form>
  `);
});

// Inicia o fluxo OAuth
app.post('/auth', async (req, res) => {
  const nomeCliente = req.body.cliente;
  const tokenPath = path.join(process.cwd(), `token_${nomeCliente}.json`);

  const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
  const { client_secret, client_id, redirect_uris } = credentials.installed;

  const oAuth2Client = new google.auth.OAuth2(
    client_id, client_secret, redirect_uris[0]
  );

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    state: nomeCliente,
  });

  // Redireciona para a URL de login do Google
  res.redirect(authUrl);
});

// Final do fluxo OAuth
app.get('/oauth2callback', async (req, res) => {
  const nomeCliente = req.query.state;
  const code = req.query.code;

  const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
  const { client_secret, client_id, redirect_uris } = credentials.installed;

  const oAuth2Client = new google.auth.OAuth2(
    client_id, client_secret, redirect_uris[0]
  );

  const { tokens } = await oAuth2Client.getToken(code);
  fs.writeFileSync(`token_${nomeCliente}.json`, JSON.stringify(tokens));

  res.send(`<h2>✅ Conexão realizada com sucesso!</h2><p>Agora a Luni pode agendar diretamente na sua agenda Google.</p>`);
  console.log(`✅ Token salvo: token_${nomeCliente}.json`);
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor de autenticação rodando em: http://localhost:${PORT}`);
  open(`http://localhost:${PORT}`);
});
