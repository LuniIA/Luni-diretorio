// config/clientMapping.js
// Mapeamento de números de telefone para clientes da Luni

// Mapeamento de números para clientes
const CLIENT_MAPPING = {
  // NÚMERO DO TWILIO - Mapeado para barbeariaimperial
  '+14155238886': 'barbeariaimperial',
  
  // Números de teste (você pode adicionar seus números aqui)
  '+554789229426': 'barbeariaimperial', // Seu número para teste
  '+5511999999999': 'barbeariaimperial',
  '+5511888888888': 'belezavivaestetica',
  '+5511777777777': 'studioGlow',
  '+5511666666666': 'bellaModa',
  '+5511555555555': 'tecnofrio',
  '+5511444444444': 'RelaxExpress',
  '+5511333333333': 'VibeSecreta',
  '+5511222222222': 'GráficaÁgil',
  
  // Números reais (substitua pelos números dos seus clientes)
  // '+5511999999999': 'barbeariaimperial',
  // '+5511888888888': 'belezavivaestetica',
  
  // Fallback para números não mapeados
  'default': 'barbeariaimperial'
};

// Função para obter cliente por número
export function getClienteByPhone(phoneNumber) {
  // Normalizar número (remover espaços, traços, etc.)
  const normalizedPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
  
  // Buscar no mapeamento
  const clienteId = CLIENT_MAPPING[normalizedPhone] || CLIENT_MAPPING['default'];
  
  return {
    clienteId,
    phoneNumber: normalizedPhone,
    isMapped: !!CLIENT_MAPPING[normalizedPhone],
    isDefault: !CLIENT_MAPPING[normalizedPhone]
  };
}

// Função para listar todos os clientes disponíveis
export function listAvailableClients() {
  return Object.keys(CLIENT_MAPPING).filter(key => key !== 'default');
}

// Função para adicionar novo mapeamento
export function addClientMapping(phoneNumber, clienteId) {
  CLIENT_MAPPING[phoneNumber] = clienteId;
  return true;
}

// Função para remover mapeamento
export function removeClientMapping(phoneNumber) {
  if (CLIENT_MAPPING[phoneNumber] && phoneNumber !== 'default') {
    delete CLIENT_MAPPING[phoneNumber];
    return true;
  }
  return false;
}

// Função para obter estatísticas
export function getMappingStats() {
  const totalMappings = Object.keys(CLIENT_MAPPING).length - 1; // -1 para 'default'
  const mappedNumbers = Object.keys(CLIENT_MAPPING).filter(key => key !== 'default');
  
  return {
    totalMappings,
    mappedNumbers,
    defaultClient: CLIENT_MAPPING['default']
  };
}

export default {
  getClienteByPhone,
  listAvailableClients,
  addClientMapping,
  removeClientMapping,
  getMappingStats
};
