import { carregarCliente } from '../clienteLoader.js';
import { processaMensagem } from '../core/app.js';

async function main() {
  const cliente = carregarCliente(process.argv[2] || 'barbeariaimperial');
  if (!cliente) {
    console.error('Cliente de teste não encontrado');
    process.exit(1);
  }
  const msg = process.argv.slice(3).join(' ') || 'Oi, quanto custa o corte?';
  const r = await processaMensagem(msg, cliente, true, 'tarde', 'texto', null, { sessionId: 'smoke', clienteId: cliente.nomeArquivo });
  console.log('\nMensagem:', msg);
  console.log('\nResposta:', r.resposta);
}

main().catch(e => { console.error(e); process.exit(1); });


