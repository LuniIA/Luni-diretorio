// clienteLoader.js v1.7-log
// Responsável por carregar os arquivos .json dos clientes com validação básica + debugLog

import fs from 'fs';
import path from 'path';
import { debugLog } from './Utils/debugLog.js'; // ✅ log utilitário centralizado

export function carregarCliente(nomeArquivo) {
  if (!nomeArquivo || typeof nomeArquivo !== 'string') {
    console.error(`❌ Nome de arquivo inválido recebido: '${nomeArquivo}'`);
    debugLog('clienteLoader > nome inválido', { nomeArquivo });
    return null;
  }

  const nomeNormalizado = nomeArquivo.trim();

  if (nomeNormalizado.length === 0) {
    console.error('❌ Nome de arquivo vazio após normalização.');
    debugLog('clienteLoader > nome vazio', { nomeArquivo });
    return null;
  }

  if (nomeNormalizado !== nomeArquivo) {
    console.warn(`⚠️ Nome de arquivo '${nomeArquivo}' continha espaços extras. Usando '${nomeNormalizado}'.`);
    debugLog('clienteLoader > nome normalizado', { nomeArquivo, nomeNormalizado });
  }

  const caminho = path.resolve('./clientes', `${nomeNormalizado}.json`);

  if (!fs.existsSync(caminho)) {
    console.error(`❌ Arquivo do cliente '${nomeNormalizado}' não encontrado em ./clientes`);
    debugLog('clienteLoader > não encontrado', { nomeArquivo: nomeNormalizado });
    return null;
  }

  try {
    const dados = fs.readFileSync(caminho, 'utf-8');
    const cliente = JSON.parse(dados);

    cliente.nomeArquivo = nomeNormalizado; // sempre atribui

    // Verificações básicas obrigatórias
    const camposObrigatorios = ['nome', 'segmento', 'intensidadeVendas'];
    const ausentes = camposObrigatorios.filter(c => !cliente[c]);

    if (ausentes.length > 0) {
      console.warn(`⚠️ O cliente '${nomeArquivo}' pode estar com campos obrigatórios ausentes: ${ausentes.join(', ')}`);
      debugLog('clienteLoader > campos ausentes', { nomeArquivo, ausentes });
    }

    debugLog('clienteLoader > cliente carregado', {
      nomeArquivo,
      nome: cliente.nome,
      segmento: cliente.segmento,
      intensidadeVendas: cliente.intensidadeVendas
    });

    return cliente;

  } catch (erro) {
    console.error(`❌ Erro ao carregar cliente '${nomeArquivo}': ${erro.message}`);
    debugLog('clienteLoader > erro JSON', { nomeArquivo, erro: erro.message });
    return null;
  }
}
