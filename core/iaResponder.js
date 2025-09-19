// core/iaResponder.js v1.3 – Geração de prompt e resposta da IA com logs

import OpenAI from 'openai';
import 'dotenv/config';
import { construirPrompt } from './promptBuilder.js';  // mantém import necessário
import { debugLog } from '../Utils/debugLog.js';        // 🔥 novo helper de log

// Verificar se a API key está configurada
if (!process.env.OPENAI_API_KEY) {
  console.error('❌ ERRO: OPENAI_API_KEY não está configurada!');
  console.error('Crie um arquivo .env na raiz do projeto com:');
  console.error('OPENAI_API_KEY=sua-chave-api-aqui');
  process.exit(1);
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function gerarRespostaIA(prompt, mensagemUsuario, opcoes = {}) {
  try {
    const inicio = Date.now();
    debugLog('iaResponder > chamada iniciada', {
      promptPreview: prompt.slice(0, 120),
      mensagemUsuario,
      opcoes
    });

    const resposta = await openai.chat.completions.create({
      model: opcoes.model || 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: mensagemUsuario },
      ],
      max_tokens: opcoes.maxOutputTokens || 700,
    });

    const tempo = Date.now() - inicio;
    const respostaGerada = resposta?.choices?.[0]?.message?.content || '';

    debugLog('iaResponder > resposta recebida', {
      tempoMs: tempo,
      respostaPreview: respostaGerada.slice(0, 120),
    });

    return { 
      respostaGerada, 
      tempoMs: tempo,
      tokensOut: resposta?.usage?.completion_tokens || null,
      modelUsed: opcoes.model || 'gpt-3.5-turbo'
    };
  } catch (erro) {
    console.error('❌ Erro na chamada da OpenAI:', erro.message);
    debugLog('iaResponder > erro na chamada OpenAI', { erro: erro.message });

    return {
      respostaGerada:
        '⚠️ Desculpe, tivemos uma instabilidade. Pode tentar novamente em alguns minutos?',
      tempoMs: 0,
      tokensOut: null,
      modelUsed: opcoes.model || 'gpt-3.5-turbo'
    };
  }
}

// 🔁 Reexporta para uso centralizado no app.js
export { construirPrompt };
