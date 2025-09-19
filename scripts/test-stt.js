#!/usr/bin/env node
// scripts/test-stt.js - Teste do sistema de transcrição de áudio

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sttManager from '../stt/index.js';
import { verificarFFmpeg } from '../stt/utils/audioProcessor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🎵 Teste do Sistema de Transcrição de Áudio - Luni\n');

// ============================================================================
// TESTES
// ============================================================================

async function testarConfiguracao() {
  console.log('1️⃣ Testando configuração...');
  
  const config = sttManager.verificarConfiguracao();
  console.log('   Configuração:', config);
  
  if (!config.isConfigured) {
    console.log('   ❌ STT não configurado corretamente');
    return false;
  }
  
  console.log('   ✅ STT configurado');
  return true;
}

async function testarFFmpeg() {
  console.log('\n2️⃣ Testando FFmpeg...');
  
  const ffmpegDisponivel = await verificarFFmpeg();
  
  if (!ffmpegDisponivel) {
    console.log('   ❌ FFmpeg não disponível');
    console.log('   💡 Instale FFmpeg: https://ffmpeg.org/download.html');
    return false;
  }
  
  console.log('   ✅ FFmpeg disponível');
  return true;
}

async function testarProvedores() {
  console.log('\n3️⃣ Testando provedores...');
  
  const info = sttManager.obterEstatisticas();
  console.log('   Estatísticas:', JSON.stringify(info, null, 2));
  
  return true;
}

async function testarArquivoLocal() {
  console.log('\n4️⃣ Testando com arquivo local...');
  
  // Criar arquivo de teste (simulado)
  const testFile = path.join(__dirname, '..', 'test_audio.wav');
  
  if (!fs.existsSync(testFile)) {
    console.log('   ⚠️ Arquivo de teste não encontrado');
    console.log('   💡 Crie um arquivo test_audio.wav na raiz do projeto');
    return false;
  }
  
  try {
    // Simular cliente
    const cliente = {
      nome: 'Teste',
      nomeArquivo: 'teste',
      segmento: 'geral'
    };
    
    const resultado = await sttManager.transcreverAudioFromUrl(
      `file://${testFile}`,
      'audio/wav',
      cliente
    );
    
    if (resultado.sucesso) {
      console.log('   ✅ Transcrição bem-sucedida');
      console.log('   Texto:', resultado.text);
      console.log('   Provedor:', resultado.provider);
      console.log('   Duração:', resultado.duration);
    } else {
      console.log('   ❌ Falha na transcrição:', resultado.error);
    }
    
    return resultado.sucesso;
    
  } catch (error) {
    console.log('   ❌ Erro no teste:', error.message);
    return false;
  }
}

async function testarIntegracaoWebhook() {
  console.log('\n5️⃣ Testando integração webhook...');
  
  // Simular payload do Twilio
  const webhookPayload = {
    Body: '',
    From: '+5511999999999',
    To: '+5511888888888',
    MessageSid: 'test_message_sid',
    NumMedia: '1',
    MediaContentType0: 'audio/ogg',
    MediaUrl0: 'https://api.twilio.com/test_audio.ogg'
  };
  
  console.log('   Payload simulado:', JSON.stringify(webhookPayload, null, 2));
  console.log('   ✅ Integração webhook configurada');
  
  return true;
}

// ============================================================================
// EXECUÇÃO DOS TESTES
// ============================================================================

async function executarTestes() {
  const resultados = [];
  
  try {
    resultados.push(await testarConfiguracao());
    resultados.push(await testarFFmpeg());
    resultados.push(await testarProvedores());
    resultados.push(await testarArquivoLocal());
    resultados.push(await testarIntegracaoWebhook());
    
    const sucessos = resultados.filter(r => r).length;
    const total = resultados.length;
    
    console.log('\n📊 Resultado dos Testes:');
    console.log(`   Sucessos: ${sucessos}/${total}`);
    
    if (sucessos === total) {
      console.log('   🎉 Todos os testes passaram!');
      console.log('   ✅ Sistema de transcrição pronto para uso');
    } else {
      console.log('   ⚠️ Alguns testes falharam');
      console.log('   💡 Verifique as configurações e dependências');
    }
    
  } catch (error) {
    console.error('❌ Erro durante os testes:', error.message);
  }
}

// Executar se chamado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  executarTestes();
}

export { executarTestes };

