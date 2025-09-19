# Deploy Staging na Render (passo a passo simples)

## Pré-requisitos
- Conta na Render (https://render.com)
- Repositório no GitHub com este projeto
- Twilio configurado (número e Console acessível)

## 1) Criar Web Service
1. Clique em New → Web Service
2. Conecte seu GitHub e selecione o repositório
3. Na tela de configuração:
   - Name: `luni-staging`
   - Environment: `Node`
   - Region: `Oregon` (ou mais próxima)
   - Plan: `Starter`
   - Build Command: `npm ci`
   - Start Command: `node server.js`
   - Health check path: `/health`
4. Em Environment Variables, adicione:
   - `NODE_ENV=production`
   - `LOG_LEVEL=info`
   - `PORT=3000`
   - `OPENAI_API_KEY=...`
   - (Opcional) `USE_REDIS=0` (usa storage em arquivos)
   - (Depois) Twilio: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
5. Clique Deploy.

## 2) Validar
- Acesse `https://<seu-app>.onrender.com/health` → deve retornar `{ status: 'ok', ... }`
- Acesse `https://<seu-app>.onrender.com/stt/info` → deve mostrar configurações do STT

## 3) Integrar com Twilio
1. No Console Twilio → WhatsApp / Messaging, configure o Webhook:
   - URL: `https://<seu-app>.onrender.com/webhook`
   - Método: `POST`
2. Envie uma mensagem de teste para o número
3. Verifique os logs na Render (Logs → Live)

## 4) Variáveis futuras (Staging → Prod)
- Redis gerenciado (Upstash ou DO) e `USE_REDIS=1`
- Postgres (Neon/DO) para sessões/histórico se necessário
- S3/B2 para backups (`S3_ACCESS_KEY`, `S3_SECRET`, `S3_BUCKET`)

## 5) Rollback
- Na aba Deploys, selecione um deploy anterior e clique Rollback

## 6) Dúvidas rápidas
- Se /health falhar: veja Logs e `OPENAI_API_KEY`
- Se webhook não responder: confirme Content-Type `x-www-form-urlencoded` no Twilio
- Se áudio não transcrever: teste com M4A/OGG e confirme `OPENAI_API_KEY`
