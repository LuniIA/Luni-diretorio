// planManager.js v2.0 – Gestão de planos com modelos e preços corretos

function getDefaultPlans() {
	return {
		basico: {
			name: 'basico',
			description: 'Conversas simples e objetivas',
			tokensInBudget: 2500,
			tokensOutBudget: 600,
			usdInPer1k: 0.00015,  // GPT-4o mini: $0.15 por 1M tokens entrada
			usdOutPer1k: 0.0006,  // GPT-4o mini: $0.60 por 1M tokens saída
			model: 'gpt-4o-mini'
		},
		pro: {
			name: 'pro',
			description: 'Vendas consultivas e explicações técnicas',
			tokensInBudget: 4000,
			tokensOutBudget: 800,
			usdInPer1k: 0.00015,  // GPT-4o mini: $0.15 por 1M tokens entrada
			usdOutPer1k: 0.0006,  // GPT-4o mini: $0.60 por 1M tokens saída
			model: 'gpt-4o-mini'
		},
		enterprise: {
			name: 'enterprise',
			description: 'Conversas complexas, objeções e negociações',
			tokensInBudget: 6000,
			tokensOutBudget: 1000,
			usdInPer1k: 0.01,     // GPT-4 Turbo: $10.00 por 1M tokens entrada
			usdOutPer1k: 0.03,    // GPT-4 Turbo: $30.00 por 1M tokens saída
			model: 'gpt-4-turbo'
		}
	};
}

export function getPlanConfig(planName) {
	const plans = getDefaultPlans();
	const normalized = String(planName || 'basico').toLowerCase();
	return plans[normalized] || plans.basico;
}

export function resolveBudgetsForCliente(cliente, defaults) {
	const planConfig = getPlanConfig(cliente?.plano);
	const tokensIn = Number(planConfig.tokensInBudget || defaults.tokensIn);
	const tokensOut = Number(planConfig.tokensOutBudget || defaults.tokensOut);
	const usdInPer1k = Number(planConfig.usdInPer1k || defaults.usdIn);
	const usdOutPer1k = Number(planConfig.usdOutPer1k || defaults.usdOut);
	const model = String(planConfig.model || defaults.model);

	return {
		plan: planConfig.name,
		description: planConfig.description,
		tokensIn,
		tokensOut,
		usdInPer1k,
		usdOutPer1k,
		model
	};
}


