// clienteLoader.js v1.7-log
// Responsável por carregar os arquivos .json dos clientes com validação básica + debugLog

import fs from 'fs';
import path from 'path';
import { debugLog } from './Utils/debugLog.js'; // ✅ log utilitário centralizado

export function carregarCliente(nomeArquivo) {
  const caminho = path.resolve('./clientes', `${nomeArquivo}.json`);

  if (!fs.existsSync(caminho)) {
    console.error(`❌ Arquivo do cliente '${nomeArquivo}' não encontrado em ./clientes`);
    debugLog('clienteLoader > não encontrado', { nomeArquivo });
    return null;
  }

  try {
    const dados = fs.readFileSync(caminho, 'utf-8');
    const cliente = JSON.parse(dados);

    cliente.nomeArquivo = nomeArquivo; // sempre atribui

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
