// core/sessionManager.js v3.0 – Sistema de sessão unificado da Luni
// Consolida: contextEngine/sessionManager.js + core/sessionManager.js + index.js session logic
// Mantém compatibilidade com APIs existentes + funcionalidades avançadas

import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
// Função de debug simples para não depender de logger externo
function debugLog(modulo, dados) {
  if (process.env.DEBUG === 'true') {
    console.log(`🔍 [${modulo}]`, dados);
  }
}

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================

const SESSION_DIR = './historico/sessoes';
const DEFAULT_TIMEOUT = process.env.LIMITE_SESSAO_MS 
  ? Number(process.env.LIMITE_SESSAO_MS) 
  : 1000 * 60 * 60 * 12; // 12 horas

const CONFIG = {
  sessionTimeout: DEFAULT_TIMEOUT,
  maxSessions: 1000,
  cleanupInterval: 5 * 60 * 1000, // 5 minutos
  persistToFile: true,
  enableAnalytics: true
};

// ============================================================================
// CLASSE PRINCIPAL
// ============================================================================

class SessionManager {
  constructor() {
    this.sessions = new Map(); // sessionId -> session
    this.clientSessions = new Map(); // clienteId -> sessionId
    this.analytics = {
      totalSessions: 0,
      activeSessions: 0,
      expiredSessions: 0,
      averageSessionTime: 0
    };
    
    this.setupCleanup();
    this.loadPersistedSessions();
  }

  // ============================================================================
  // API PRINCIPAL
  // ============================================================================

  /**
   * Cria uma nova sessão para um cliente
   */
  createSession(clienteId, metadata = {}) {
    const sessionId = uuidv4();
    const now = Date.now();
    
    const session = {
      id: sessionId,
      clienteId,
      createdAt: now,
      lastActivity: now,
      metadata: {
        focoAtual: null,
        etapaFunil: 'descoberta',
        primeiraInteracao: true,
        ...metadata
      },
      context: {
        messages: [],
        variables: {},
        tags: [],
        ultimaInteracaoTimestamp: now
      },
      stats: {
        messageCount: 0,
        totalTime: 0
      }
    };

    this.sessions.set(sessionId, session);
    this.clientSessions.set(clienteId, sessionId);
    this.analytics.totalSessions++;
    this.analytics.activeSessions++;

    if (CONFIG.persistToFile) {
      this.persistSession(session);
    }

    debugLog('sessionManager > createSession', { sessionId, clienteId, metadata });
    return session;
  }

  /**
   * Obtém uma sessão por ID
   */
  getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session && this.isSessionValid(sessionId)) {
      return session;
    }
    return null;
  }

  /**
   * Obtém sessão por cliente ID
   */
  getSessionByClient(clienteId) {
    const sessionId = this.clientSessions.get(clienteId);
    if (sessionId) {
      return this.getSession(sessionId);
    }
    return null;
  }

  /**
   * Atualiza uma sessão existente
   */
  updateSession(sessionId, updates) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      debugLog('sessionManager > updateSession: session not found', { sessionId });
      return null;
    }

    // Atualiza campos básicos
    session.lastActivity = Date.now();
    session.context.ultimaInteracaoTimestamp = session.lastActivity;

    // Atualiza metadata (usando dot notation)
    if (updates.metadata) {
      Object.assign(session.metadata, updates.metadata);
    }

    // Atualiza context
    if (updates.context) {
      Object.assign(session.context, updates.context);
    }

    // Atualiza stats
    if (updates.stats) {
      Object.assign(session.stats, updates.stats);
    }

    // Atualiza campos diretos
    Object.keys(updates).forEach(key => {
      if (!['metadata', 'context', 'stats'].includes(key)) {
        session[key] = updates[key];
      }
    });

    if (CONFIG.persistToFile) {
      this.persistSession(session);
    }

    debugLog('sessionManager > updateSession', { sessionId, updates });
    return session;
  }

  /**
   * Verifica se uma sessão é válida (não expirou)
   */
  isSessionValid(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    
    const now = Date.now();
    const timeSinceLastActivity = now - session.lastActivity;
    
    return timeSinceLastActivity < CONFIG.sessionTimeout;
  }

  /**
   * Adiciona uma mensagem à sessão
   */
  addMessage(sessionId, message, tags = []) {
    const session = this.getSession(sessionId);
    if (!session) return null;

    session.context.messages.push({
      text: message,
      timestamp: Date.now(),
      tags: tags
    });

    session.stats.messageCount++;
    session.metadata.primeiraInteracao = false;

    return this.updateSession(sessionId, {
      context: session.context,
      stats: session.stats,
      metadata: session.metadata
    });
  }

  /**
   * Remove uma sessão
   */
  removeSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.clientSessions.delete(session.clienteId);
      this.sessions.delete(sessionId);
      this.analytics.activeSessions--;
      
      if (CONFIG.persistToFile) {
        this.removePersistedSession(sessionId);
      }
      
      debugLog('sessionManager > removeSession', { sessionId });
    }
  }

  // ============================================================================
  // COMPATIBILIDADE COM APIS EXISTENTES
  // ============================================================================

  /**
   * Compatibilidade com contextEngine/sessionManager.js
   */
  isNovaSessao(ultimaInteracaoTimestamp, tags = [], nomeArquivoCliente = '') {
    debugLog('sessionManager > isNovaSessao:start', { nomeArquivoCliente, ultimaInteracaoTimestamp, tags });

    // Se não tem timestamp, tenta carregar do arquivo (compatibilidade)
    if (!ultimaInteracaoTimestamp && nomeArquivoCliente) {
      ultimaInteracaoTimestamp = this.loadLegacySession(nomeArquivoCliente);
    }

    const agora = Date.now();

    // 1. Tempo de inatividade
    if (!ultimaInteracaoTimestamp || (agora - ultimaInteracaoTimestamp) > CONFIG.sessionTimeout) {
      if (nomeArquivoCliente) this.saveLegacySession(nomeArquivoCliente, agora);
      debugLog('sessionManager > isNovaSessao:end', { novaSessao: true, motivo: 'tempo_expirado' });
      return { novaSessao: true, motivo: 'tempo_expirado' };
    }

    // 2. Mudança explícita de assunto
    if (tags.includes('mudanca_assunto')) {
      if (nomeArquivoCliente) this.saveLegacySession(nomeArquivoCliente, agora);
      debugLog('sessionManager > isNovaSessao:end', { novaSessao: true, motivo: 'mudanca_assunto' });
      return { novaSessao: true, motivo: 'mudanca_assunto' };
    }

    // 3. Continua mesma sessão
    if (nomeArquivoCliente) this.saveLegacySession(nomeArquivoCliente, agora);
    debugLog('sessionManager > isNovaSessao:end', { novaSessao: false, motivo: null });
    return { novaSessao: false, motivo: null };
  }

  /**
   * Compatibilidade com core/sessionManager.js (v2.0)
   */
  isPrimeiraInteracao(clienteNome) {
    const session = this.getSessionByClient(clienteNome);
    
    if (!session) {
      // Cria nova sessão
      this.createSession(clienteNome, { primeiraInteracao: true });
    debugLog('sessionManager > Nova sessão iniciada', { clienteNome });
      return true;
    }

    // Atualiza sessão existente
    this.updateSession(session.id, { 
      lastActivity: Date.now(),
      metadata: { ...session.metadata, primeiraInteracao: false }
    });
    
    debugLog('sessionManager > Sessão existente atualizada', { clienteNome });
    return false;
  }

  /**
   * Compatibilidade com core/sessionManager.js (v2.0)
   */
  getFocoAtual(clienteNome) {
    const session = this.getSessionByClient(clienteNome);
    const foco = session?.metadata?.focoAtual || null;
  debugLog('sessionManager > getFocoAtual()', { clienteNome, foco });
  return foco;
}

  /**
   * Compatibilidade com core/sessionManager.js (v2.0)
   */
  atualizarFocoAtual(clienteNome, novoFoco) {
    let session = this.getSessionByClient(clienteNome);
    
    if (!session) {
      session = this.createSession(clienteNome, { focoAtual: novoFoco });
    debugLog('sessionManager > sessão inicializada para foco', { clienteNome });
    } else {
      this.updateSession(session.id, {
        metadata: { ...session.metadata, focoAtual: novoFoco }
      });
  }

  debugLog('sessionManager > foco atualizado', { clienteNome, novoFoco });
}

  /**
   * Compatibilidade com core/sessionManager.js (v2.0)
   */
  resetarSessao(clienteNome) {
    const session = this.getSessionByClient(clienteNome);
    if (session) {
      this.removeSession(session.id);
    }
  debugLog('sessionManager > sessão resetada', { clienteNome });
}

  /**
   * Compatibilidade com index.js
   */
  getOrInitSessao(clienteNome) {
    const agora = Date.now();
    let session = this.getSessionByClient(clienteNome);
    
    if (!session || !this.isSessionValid(session.id)) {
      session = this.createSession(clienteNome, {
        focoAtual: null,
        primeiraInteracao: true
      });
      return { sessao: session, primeiraInteracao: true };
    }

    // Atualiza sessão existente
    this.updateSession(session.id, { lastActivity: agora });
    return { sessao: session, primeiraInteracao: false };
  }

  // ============================================================================
  // FUNCIONALIDADES AVANÇADAS
  // ============================================================================

  /**
   * Limpa sessões expiradas
   */
  cleanupExpiredSessions() {
    const now = Date.now();
    let cleaned = 0;

    for (const [sessionId, session] of this.sessions) {
      if (now - session.lastActivity > CONFIG.sessionTimeout) {
        this.removeSession(sessionId);
        cleaned++;
      }
    }

    this.analytics.expiredSessions += cleaned;
    this.analytics.activeSessions = this.sessions.size;

    if (cleaned > 0) {
      debugLog('sessionManager > cleanupExpiredSessions', { cleaned, activeSessions: this.analytics.activeSessions });
    }
  }

  /**
   * Obtém estatísticas das sessões
   */
  getSessionStats() {
    const now = Date.now();
    let totalTime = 0;
    let activeCount = 0;

    for (const session of this.sessions.values()) {
      if (this.isSessionValid(session.id)) {
        activeCount++;
        totalTime += (now - session.createdAt);
      }
    }

    this.analytics.activeSessions = activeCount;
    this.analytics.averageSessionTime = activeCount > 0 ? totalTime / activeCount : 0;

    return {
      ...this.analytics,
      currentTime: now,
      config: CONFIG
    };
  }

  /**
   * Exporta uma sessão para backup
   */
  exportSession(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) return null;

    return {
      ...session,
      exportedAt: Date.now(),
      version: '3.0'
    };
  }

  /**
   * Importa uma sessão de backup
   */
  importSession(sessionData) {
    if (!sessionData.id || !sessionData.clienteId) {
      throw new Error('Dados de sessão inválidos');
    }

    const session = {
      ...sessionData,
      lastActivity: Date.now(),
      importedAt: Date.now()
    };

    this.sessions.set(session.id, session);
    this.clientSessions.set(session.clienteId, session.id);
    
    debugLog('sessionManager > importSession', { sessionId: session.id, clienteId: session.clienteId });
    return session;
  }

  // ============================================================================
  // PERSISTÊNCIA
  // ============================================================================

  /**
   * Salva sessão em arquivo (compatibilidade com v1.2)
   */
  saveLegacySession(nomeArquivoCliente, timestamp = Date.now()) {
    this.ensureSessionDirectory();
    const filePath = path.join(SESSION_DIR, `${nomeArquivoCliente}_sessao.json`);
    
    try {
      fs.writeFileSync(filePath, JSON.stringify({ ultimaInteracao: timestamp }, null, 2));
      debugLog('sessionManager > saveLegacySession', { filePath, timestamp });
    } catch (e) {
      console.error('Erro ao salvar sessão legacy:', e.message);
    }
  }

  /**
   * Carrega sessão de arquivo (compatibilidade com v1.2)
   */
  loadLegacySession(nomeArquivoCliente) {
    const filePath = path.join(SESSION_DIR, `${nomeArquivoCliente}_sessao.json`);
    
    if (!fs.existsSync(filePath)) {
      debugLog('sessionManager > loadLegacySession', { filePath, status: 'nao_existe' });
      return null;
    }
    
    try {
      const dados = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      debugLog('sessionManager > loadLegacySession', { filePath, ultimaInteracao: dados.ultimaInteracao });
      return dados.ultimaInteracao || null;
    } catch {
      console.warn('Erro ao ler sessão legacy, retornando null');
      return null;
    }
  }

  /**
   * Persiste sessão atual em arquivo
   */
  persistSession(session) {
    this.ensureSessionDirectory();
    const filePath = path.join(SESSION_DIR, `session_${session.id}.json`);
    
    try {
      fs.writeFileSync(filePath, JSON.stringify(session, null, 2));
    } catch (e) {
      console.error('Erro ao persistir sessão:', e.message);
    }
  }

  /**
   * Remove arquivo de sessão persistida
   */
  removePersistedSession(sessionId) {
    const filePath = path.join(SESSION_DIR, `session_${sessionId}.json`);
    
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (e) {
        console.error('Erro ao remover arquivo de sessão:', e.message);
      }
    }
  }

  /**
   * Carrega sessões persistidas na inicialização
   */
  loadPersistedSessions() {
    this.ensureSessionDirectory();
    
    try {
      const files = fs.readdirSync(SESSION_DIR);
      const sessionFiles = files.filter(f => f.startsWith('session_') && f.endsWith('.json'));
      
      for (const file of sessionFiles) {
        try {
          const filePath = path.join(SESSION_DIR, file);
          const sessionData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          
          // Só carrega se a sessão não expirou
          if (Date.now() - sessionData.lastActivity < CONFIG.sessionTimeout) {
            this.sessions.set(sessionData.id, sessionData);
            this.clientSessions.set(sessionData.clienteId, sessionData.id);
            this.analytics.activeSessions++;
          } else {
            // Remove arquivo de sessão expirada
            fs.unlinkSync(filePath);
          }
        } catch (e) {
          console.warn(`Erro ao carregar sessão do arquivo ${file}:`, e.message);
        }
      }
      
      debugLog('sessionManager > loadPersistedSessions', { 
        loaded: this.analytics.activeSessions,
        totalFiles: sessionFiles.length 
      });
    } catch (e) {
      console.warn('Erro ao carregar sessões persistidas:', e.message);
    }
  }

  /**
   * Garante que o diretório de sessões existe
   */
  ensureSessionDirectory() {
    if (!fs.existsSync(SESSION_DIR)) {
      fs.mkdirSync(SESSION_DIR, { recursive: true });
      debugLog('sessionManager > ensureSessionDirectory', { criada: SESSION_DIR });
    }
  }

  // ============================================================================
  // CONFIGURAÇÃO INTERNA
  // ============================================================================

  /**
   * Configura limpeza automática
   */
  setupCleanup() {
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, CONFIG.cleanupInterval);
  }

  /**
   * Atualiza configuração
   */
  updateConfig(newConfig) {
    Object.assign(CONFIG, newConfig);
    debugLog('sessionManager > updateConfig', { newConfig });
  }
}

// ============================================================================
// INSTÂNCIA GLOBAL
// ============================================================================

export const sessionManager = new SessionManager();

// ============================================================================
// EXPORTS PARA COMPATIBILIDADE
// ============================================================================

// Compatibilidade com contextEngine/sessionManager.js
export const isNovaSessao = (timestamp, tags, cliente) => 
  sessionManager.isNovaSessao(timestamp, tags, cliente);

export const verificarNovaSessao = isNovaSessao;

// Compatibilidade com core/sessionManager.js (v2.0)
export const isPrimeiraInteracao = (cliente) => 
  sessionManager.isPrimeiraInteracao(cliente);

export const getFocoAtual = (cliente) => 
  sessionManager.getFocoAtual(cliente);

export const atualizarFocoAtual = (cliente, foco) => 
  sessionManager.atualizarFocoAtual(cliente, foco);

export const resetarSessao = (cliente) => 
  sessionManager.resetarSessao(cliente);

// Compatibilidade com index.js
export const getOrInitSessao = (cliente) => 
  sessionManager.getOrInitSessao(cliente);

// ============================================================================
// FUNCIONALIDADES AVANÇADAS EXPORTADAS
// ============================================================================

export const cleanupExpiredSessions = () => 
  sessionManager.cleanupExpiredSessions();

export const getSessionStats = () => 
  sessionManager.getSessionStats();

export const exportSession = (sessionId) => 
  sessionManager.exportSession(sessionId);

export const importSession = (sessionData) => 
  sessionManager.importSession(sessionData);

export const updateConfig = (config) => 
  sessionManager.updateConfig(config);
