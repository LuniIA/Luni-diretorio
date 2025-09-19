# Luni.app 🚀

Luni é um assistente virtual inteligente com foco em **vendas** e **atendimento automatizado** via WhatsApp, projetado especialmente para **pequenos negócios e autônomos**. Com linguagem humanizada, personalização por segmento e comportamento comercial adaptável, a Luni é sua parceira para vender mais — mesmo quando você está offline.

---

## 🗂 Estrutura de Pastas

```
Luni.app/
├── cli/                         → Scripts de terminal (onboarding e autenticação)
│   ├── criarCliente.js
│   ├── authCliente.js
│   └── authServer.js
├── core/                        → Núcleo da lógica da IA
│   ├── app.js                   → Processa mensagens da Luni
│   ├── iaResponder.js           → Gera resposta da OpenAI + prompt
│   ├── focoEngine.js            → Detecta e atualiza o foco da conversa
│   ├── agendamento.js           → Lida com agendamentos e confirmações
│   ├── planManager.js           → Gerencia planos e limites de tokens
│   └── calendarIntegration.js   → Integração com Google Calendar
├── Utils/                       → Utilitários gerais
│   ├── responseHelper.js        → Ajuda a lidar com links e respostas
│   ├── tempoUtils.js            → Funções auxiliares de tempo e horário
│   └── logger.js                → Registro de logs em arquivos
├── focos/                       → Memória temporária de contexto por cliente
│   └── helpers/
│       ├── focoManager.js
│       └── detectorDeFoco.js
├── Segmentos.js/                → Prompts modulares por segmento (moda, serviços, etc.)
│   ├── moda_feminina.js
│   ├── servicos_gerais.js
│   ├── servicos_tecnologicos.js
│   └── geral.js
├── clientes/                    → Perfis JSON de cada cliente configurado
│   ├── bellamoda.json
│   └── barbeariaimperial.json
├── historico/                   → Registros de conversa por cliente
│   └── bellamoda_log.txt
├── config/                      → Arquivos de configuração
│   └── credentials.json         → Credencial do Google Calendar
├── docs/                        → Documentação
│   ├── DISTRIBUICAO_PLANOS.md   → Distribuição de planos por cliente
│   └── PLANOS_E_CUSTOS.md       → Estudo de custos e estratégia
├── index.js                     → Interface CLI para simular conversa com cliente
├── clienteLoader.js             → Carrega JSON dos clientes
├── .env                         → Variáveis de ambiente (ex: chave da OpenAI)
├── package.json                 → Dependências e scripts
└── README.md                    → Você está aqui 😄
```

---

## 📊 Sistema de Planos

A Luni oferece **3 planos** otimizados com diferentes modelos de IA para máxima economia:

| Plano | Modelo | Tokens Entrada | Tokens Saída | Custo/Interação |
|-------|--------|----------------|--------------|-----------------|
| **Básico** | GPT-4o mini | 2.5k | 600 | $0.000735 |
| **Pro** | GPT-4o mini | 4k | 800 | $0.00108 |
| **Enterprise** | GPT-4 Turbo | 6k | 1000 | $0.09 |

**📋 Distribuição atual:**
- **Básico**: 3 clientes (Estilo Bela, RelaxExpress, TecnoFrio)
- **Pro**: 1 cliente (Barbearia Imperial)  
- **Enterprise**: 3 clientes (BelezaViva, Studio Glow, Vibe Secreta)

**💰 Custo mensal estimado**: ~$186 para todos os clientes
- GPT-4o mini (4 clientes): $0.99/mês
- GPT-4 Turbo (3 clientes): $185.40/mês

> 📖 Veja a [distribuição corrigida de planos](docs/DISTRIBUICAO_PLANOS_CORRIGIDA.md)

---

## ▶️ Como rodar localmente

1. Clone ou baixe este repositório
2. Instale as dependências:
```bash
npm install
```

3. Crie um arquivo `.env` com sua chave da OpenAI:
```env
OPENAI_API_KEY=sua-chave-aqui
```

4. Inicie o bot com:
```bash
node index.js nomeDoCliente
```

> Exemplo:
```bash
node index.js barbeariaimperial
```

---

## 🛠 Scripts úteis

```bash
node cli/criarCliente.js         # Executa questionário e gera JSON de cliente
node cli/authCliente.js perfil   # Autentica cliente com Google Calendar
node cli/authServer.js           # Autentica agenda geral (servidor)
```

---

## 📌 Funcionalidades Atuais

- IA com comportamento comercial adaptável (intensidade 1 a 3)
- Agendamento local ou com Google Calendar (plano premium)
- Personalização total por JSON: tom de voz, dúvidas, serviços, etc.
- Logs detalhados de entrada/saída por cliente
- Modularização de código para escalabilidade e manutenção
- **Sistema de planos dinâmico** com limites de tokens por cliente
- **Telemetria completa** de custos e performance

---

## ✨ Próximos passos

- Conectar ao WhatsApp via API (Twilio)
- Subir o backend para Firebase Functions ou Vercel
- Criar painel simplificado para gerenciar clientes, históricos e atualizações
- Treinamento contínuo da IA com base em conversas reais
- Suporte a múltiplos idiomas



p ver logs 
set LOG_LEVEL=debug
set LOG_TO_FILE=true
node index.js VibeSecreta
