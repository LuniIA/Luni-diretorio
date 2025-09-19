// Utils/debugLog.js - Adaptador de compatibilidade para logs de debug
// Mantém a assinatura: debugLog(modulo, dados)

export function debugLog(modulo, dados) {
	try {
		if (process.env.DEBUG === 'true') {
			const payload = typeof dados === 'object' ? JSON.stringify(dados) : String(dados);
			console.log(`🪵 ${modulo}:`, payload);
		}
	} catch (e) {
		// nunca lança em produção
	}
}
