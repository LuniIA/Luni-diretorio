import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { carregarCliente } from '../clienteLoader.js';
import { getClientMappingSnapshot } from '../config/clientMapping.js';

const CLIENTES_DIR = path.resolve('./clientes');

const listarArquivosCliente = () =>
  fs.readdirSync(CLIENTES_DIR)
    .filter(file => file.endsWith('.json'));

test('arquivos de clientes não possuem espaços no início ou fim', () => {
  const arquivos = listarArquivosCliente();

  for (const arquivo of arquivos) {
    assert.equal(
      arquivo,
      arquivo.trim(),
      `O arquivo '${arquivo}' contém espaços no início ou fim.`
    );
  }
});

test('cada mapeamento de cliente aponta para um arquivo existente', () => {
  const mapping = getClientMappingSnapshot();

  for (const [numero, clienteId] of Object.entries(mapping)) {
    if (numero === 'default') continue;

    const cliente = carregarCliente(clienteId);

    assert.ok(
      cliente,
      `O número '${numero}' está mapeado para '${clienteId}', mas o arquivo não foi encontrado.`
    );
  }
});

test('carregarCliente normaliza nomes com espaços extras', () => {
  const cliente = carregarCliente(' GráficaÁgil ');

  assert.ok(cliente, 'O cliente com espaços extras não foi carregado.');
  assert.equal(
    cliente.nomeArquivo,
    'GráficaÁgil',
    'O nome do arquivo deveria ser normalizado removendo espaços extras.'
  );
});
