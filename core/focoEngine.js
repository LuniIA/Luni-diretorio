// core/focoEngine.js
// Responsável por detectar e atualizar focos do cliente

import { detectarFoco } from '../focos/helpers/detectorDeFoco.js';
import storeAdapter from '../config/storeAdapter.js';

import { debugLog } from '../Utils/debugLog.js'; // ✅ Adicionado

/**
 * Função principal chamada pelo app.js
 * Detecta foco e atualiza registros
 */
export async function detectarFocoEAtualizar(mensagem, cliente) {
  let focoDetectado = {};
  try {
    focoDetectado = detectarFoco(mensagem, cliente);
    debugLog('focoEngine > focoDetectado', focoDetectado);

    await storeAdapter.atualizarFocos(cliente.nomeArquivo, focoDetectado);
    debugLog('focoEngine > atualizarFocos', { cliente: cliente.nomeArquivo });

    await storeAdapter.limparFocosExpirados(cliente.nomeArquivo);
    debugLog('focoEngine > limparFocosExpirados', { cliente: cliente.nomeArquivo });

  } catch (erro) {
    console.warn("⚠️ Erro ao detectar ou atualizar foco:", erro.message);
    debugLog('focoEngine > erro detectarFocoEAtualizar', { erro: erro.message });
  }
  return focoDetectado;
}

// Alias do nome antigo (caso ainda esteja em uso em outro lugar)
export const processarFoco = detectarFocoEAtualizar;

/**
 * Atualiza último agendamento como confirmado
 */
export async function registrarConfirmacaoAgendamento(nomeArquivo) {
  try {
    const focos = await storeAdapter.getFocos(nomeArquivo);
    const agendamentos = focos.focos.agendamento || [];

    if (agendamentos.length > 0) {
      agendamentos[agendamentos.length - 1].confirmado = true;
      await storeAdapter.atualizarFocos(nomeArquivo, { agendamento: agendamentos });

      debugLog('focoEngine > confirmar agendamento', {
        nomeArquivo,
        agendamentoConfirmado: agendamentos[agendamentos.length - 1]
      });
    } else {
      debugLog('focoEngine > nenhum agendamento encontrado', { nomeArquivo });
    }
  } catch (e) {
    debugLog('focoEngine > erro confirmar agendamento', { erro: e.message });
  }
}

/**
 * Registra dúvida recente na memória
 */
export async function registrarDuvida(nomeArquivo, mensagem) {
  try {
    await storeAdapter.atualizarFocos(nomeArquivo, { duvidasRecentes: [mensagem] });
    debugLog('focoEngine > registrarDuvida', { nomeArquivo, mensagem });
  } catch (e) {
    debugLog('focoEngine > erro registrarDuvida', { erro: e.message });
  }
}
