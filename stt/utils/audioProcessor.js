// stt/utils/audioProcessor.js - Processamento de áudio
// Download, transcodificação e limpeza de arquivos temporários

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { debugLog } from '../../Utils/debugLog.js';

/**
 * Processa áudio: download + transcodificação
 */
export async function processarAudio(mediaUrl, contentType) {
  const startTime = Date.now();
  const tempDir = process.env.TEMP_DIR || '/tmp';
  const timestamp = Date.now();
  
  // Nomes dos arquivos temporários
  const inputFile = path.join(tempDir, `audio_input_${timestamp}.ogg`);
  const outputFile = path.join(tempDir, `audio_output_${timestamp}.wav`);
  
  try {
    debugLog('audioProcessor', {
      action: 'iniciando_processamento',
      mediaUrl,
      contentType,
      inputFile,
      outputFile
    });

    // 1. Download do arquivo
    await baixarArquivo(mediaUrl, inputFile);
    
    // 2. Obter duração do áudio
    const duration = await obterDuracaoAudio(inputFile);
    
    // 3. Transcodificar se necessário
    if (contentType === 'audio/ogg' || contentType.includes('ogg')) {
      await transcodificarOggParaWav(inputFile, outputFile);
      
      // Limpar arquivo original
      await limparArquivo(inputFile);
      
      return {
        audioPath: outputFile,
        duration,
        originalFormat: 'ogg',
        convertedFormat: 'wav'
      };
    } else {
      // Arquivo já está em formato compatível
      return {
        audioPath: inputFile,
        duration,
        originalFormat: contentType,
        convertedFormat: contentType
      };
    }

  } catch (error) {
    // Limpeza em caso de erro
    await limparArquivosTemporarios([inputFile, outputFile]);
    throw error;
  }
}

/**
 * Baixa arquivo de áudio do Twilio
 */
async function baixarArquivo(url, outputPath) {
  const startTime = Date.now();
  
  try {
    debugLog('audioProcessor', {
      action: 'iniciando_download',
      url,
      outputPath
    });

    // Configurar autenticação Twilio
    const auth = {
      username: process.env.TWILIO_ACCOUNT_SID,
      password: process.env.TWILIO_AUTH_TOKEN
    };

    // Fazer download
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream',
      auth: auth,
      timeout: 30000 // 30 segundos
    });

    // Verificar status
    if (response.status !== 200) {
      throw new Error(`Erro no download: HTTP ${response.status}`);
    }

    // Salvar arquivo
    const writer = fs.createWriteStream(outputPath);
    response.data.pipe(writer);

    // Aguardar conclusão
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    // Verificar se arquivo foi criado
    if (!fs.existsSync(outputPath)) {
      throw new Error('Arquivo não foi criado após download');
    }

    const fileSize = fs.statSync(outputPath).size;
    const duration = Date.now() - startTime;

    debugLog('audioProcessor', {
      action: 'download_concluido',
      outputPath,
      fileSize,
      duration
    });

  } catch (error) {
    debugLog('audioProcessor', {
      action: 'erro_download',
      error: error.message,
      url
    });
    throw new Error(`Erro no download: ${error.message}`);
  }
}

/**
 * Transcoda OGG para WAV usando ffmpeg
 */
async function transcodificarOggParaWav(inputFile, outputFile) {
  const startTime = Date.now();
  
  try {
    debugLog('audioProcessor', {
      action: 'iniciando_transcodificacao',
      inputFile,
      outputFile
    });

    // Comando ffmpeg
    const ffmpegArgs = [
      '-y', // Sobrescrever arquivo de saída
      '-i', inputFile, // Arquivo de entrada
      '-ar', '16000', // Taxa de amostragem: 16kHz
      '-ac', '1', // Mono
      '-acodec', 'pcm_s16le', // Codec PCM 16-bit
      outputFile // Arquivo de saída
    ];

    // Executar ffmpeg
    await new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', ffmpegArgs);
      
      let stderr = '';
      
      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`ffmpeg falhou com código ${code}: ${stderr}`));
        }
      });
      
      ffmpeg.on('error', (error) => {
        reject(new Error(`Erro ao executar ffmpeg: ${error.message}`));
      });
    });

    // Verificar se arquivo foi criado
    if (!fs.existsSync(outputFile)) {
      throw new Error('Arquivo de saída não foi criado');
    }

    const duration = Date.now() - startTime;
    const outputSize = fs.statSync(outputFile).size;

    debugLog('audioProcessor', {
      action: 'transcodificacao_concluida',
      outputFile,
      outputSize,
      duration
    });

  } catch (error) {
    debugLog('audioProcessor', {
      action: 'erro_transcodificacao',
      error: error.message,
      inputFile,
      outputFile
    });
    throw new Error(`Erro na transcodificação: ${error.message}`);
  }
}

/**
 * Obtém duração do áudio usando ffprobe
 */
async function obterDuracaoAudio(audioFile) {
  try {
    const ffprobeArgs = [
      '-v', 'quiet',
      '-show_entries', 'format=duration',
      '-of', 'csv=p=0',
      audioFile
    ];

    const duration = await new Promise((resolve, reject) => {
      const ffprobe = spawn('ffprobe', ffprobeArgs);
      
      let stdout = '';
      let stderr = '';
      
      ffprobe.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      ffprobe.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      ffprobe.on('close', (code) => {
        if (code === 0) {
          const duration = parseFloat(stdout.trim());
          resolve(isNaN(duration) ? 0 : duration);
        } else {
          reject(new Error(`ffprobe falhou: ${stderr}`));
        }
      });
      
      ffprobe.on('error', (error) => {
        reject(new Error(`Erro ao executar ffprobe: ${error.message}`));
      });
    });

    debugLog('audioProcessor', {
      action: 'duracao_obtida',
      audioFile,
      duration
    });

    return duration;

  } catch (error) {
    debugLog('audioProcessor', {
      action: 'erro_obter_duracao',
      error: error.message,
      audioFile
    });
    
    // Retornar duração padrão se não conseguir obter
    return 0;
  }
}

/**
 * Limpa arquivo individual
 */
async function limparArquivo(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      debugLog('audioProcessor', {
        action: 'arquivo_removido',
        filePath
      });
    }
  } catch (error) {
    debugLog('audioProcessor', {
      action: 'erro_remover_arquivo',
      error: error.message,
      filePath
    });
  }
}

/**
 * Limpa múltiplos arquivos temporários
 */
export async function limparArquivosTemporarios(filePaths) {
  const promises = filePaths.map(filePath => limparArquivo(filePath));
  await Promise.allSettled(promises);
  
  debugLog('audioProcessor', {
    action: 'limpeza_concluida',
    arquivos: filePaths.length
  });
}

/**
 * Verifica se ffmpeg está disponível
 */
export async function verificarFFmpeg() {
  try {
    await new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', ['-version']);
      
      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`ffmpeg não disponível (código ${code})`));
        }
      });
      
      ffmpeg.on('error', (error) => {
        reject(new Error(`ffmpeg não encontrado: ${error.message}`));
      });
    });

    return true;
  } catch (error) {
    debugLog('audioProcessor', {
      action: 'ffmpeg_nao_disponivel',
      error: error.message
    });
    return false;
  }
}

/**
 * Obtém informações do processador
 */
export function obterInfoProcessador() {
  return {
    tempDir: process.env.TEMP_DIR || '/tmp',
    supportedFormats: ['audio/ogg', 'audio/wav', 'audio/mp3', 'audio/m4a'],
    outputFormat: 'wav',
    outputSampleRate: '16000',
    outputChannels: 'mono',
    maxFileSize: '25MB'
  };
}

