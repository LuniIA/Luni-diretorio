// segmentos/index.js (dinâmico)
// 📚 Carrega automaticamente todos os arquivos de segmentos na pasta
// Última atualização: 2025-05-07

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const segmentos = {};

// Lê todos os arquivos .js da pasta (exceto index.js)
const arquivos = fs.readdirSync(__dirname).filter((arquivo) =>
  arquivo.endsWith('.js') && arquivo !== 'index.js'
);

// Importa dinamicamente cada segmento
for (const arquivo of arquivos) {
  const nomeSegmento = path.basename(arquivo, '.js');
  const modulo = await import(`./${arquivo}`);
  segmentos[nomeSegmento] = modulo.default;
}

// Exporta objeto com todos os segmentos disponíveis
export default segmentos;
