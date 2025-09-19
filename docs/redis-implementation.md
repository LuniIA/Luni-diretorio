# Implementação Redis para Luni

## 📋 Visão Geral

Esta implementação adiciona Redis como "memória curta" inteligente para a Luni, proporcionando:

- **⚡ Velocidade**: Dados na RAM (ms → µs)
- **💰 Economia**: Redução de tokens com resumo + janela deslizante
- **🧠 Memória Inteligente**: TTL automático de 72h
- **🔒 Escala**: Locks para evitar duplo agendamento

## 🏗️ Arquitetura

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Luni App      │    │   Redis Store   │    │   Redis Server  │
│                 │    │                 │    │                 │
│ ┌─────────────┐ │    │ ┌─────────────┐ │    │ ┌─────────────┐ │
│ │SessionStore │◄┼────┼►│SessionStore │◄┼────┼►│   Redis     │ │
│ │             │ │    │ │             │ │    │ │   (RAM)     │ │
│ └─────────────┘ │    │ └─────────────┘ │    │ └─────────────┘ │
│                 │    │                 │    │                 │
│ ┌─────────────┐ │    │ ┌─────────────┐ │    │                 │
│ │ FocoStore   │◄┼────┼►│ FocoStore   │◄┼────┼─────────────────┘
│ │             │ │    │ │             │ │
│ └─────────────┘ │    │ └─────────────┘ │
└─────────────────┘    └─────────────────┘
```

## 📁 Estrutura de Arquivos

```
config/
├── redisClient.js      # Cliente Redis otimizado
├── sessionStore.js     # Store de sessões (Redis/fallback)
├── focoStore.js        # Store de focos (Redis/fallback)
└── redis.example.env   # Configuração de exemplo

scripts/
└── setup-redis.js      # Script de setup automático

test_redis_fase_a.js    # Testes unitários
```

## 🚀 Instalação

### 1. Setup Automático (Recomendado)

```bash
# Executa setup completo
node scripts/setup-redis.js

# Ou comandos específicos
node scripts/setup-redis.js setup    # Setup inicial
node scripts/setup-redis.js status   # Ver status
node scripts/setup-redis.js logs     # Ver logs
node scripts/setup-redis.js cleanup  # Limpar tudo
```

### 2. Setup Manual

```bash
# 1. Iniciar Redis com Docker
docker run -d --name redis-luni -p 6379:6379 \
  redis:7 redis-server --requirepass senha-forte \
  --maxmemory 512mb --maxmemory-policy allkeys-lru

# 2. Configurar variáveis de ambiente
cp config/redis.example.env .env
# Edite .env conforme necessário

# 3. Testar implementação
node test_redis_fase_a.js
```

## ⚙️ Configuração

### Variáveis de Ambiente

```bash
# Ativa/desativa Redis
USE_REDIS=1

# URL de conexão
REDIS_URL=redis://default:senha-forte@127.0.0.1:6379

# TTL em segundos (72h = 259200)
REDIS_TTL_SECONDS=259200

# Debug
DEBUG=true
LOG_LEVEL=info
```

### Configurações de Produção

#### Upstash (Recomendado)
```bash
REDIS_URL=redis://default:senha@host.upstash.io:port
```

#### Redis Cloud
```bash
REDIS_URL=redis://default:senha@host.redis.cloud:port
```

#### AWS ElastiCache
```bash
REDIS_URL=redis://host.elasticache.amazonaws.com:6379
```

## 🔧 Uso

### Feature Flag

A implementação usa feature flag para permitir rollback seguro:

```bash
# Com Redis
USE_REDIS=1 node index.js

# Sem Redis (fallback para arquivos)
USE_REDIS=0 node index.js
```

### API Compatível

A API mantém compatibilidade total com o código existente:

```javascript
// Antes (sessionManager.js)
const session = sessionManager.createSession(clienteId, metadata);

// Depois (sessionStore.js) - mesma API!
const session = sessionStore.createSession(clienteId, metadata);
```

## 📊 Modelo de Dados Redis

### Chaves de Sessão

```
luni:sess:{cliente}:{canal}:{userId}:ctx → HASH
  - sessionId, clienteId, createdAt, lastActivity
  - metadata (JSON), context (JSON), stats (JSON)
  - summary, focus, paused, token_est, updated_at

luni:sess:{cliente}:{canal}:{userId}:msgs → LIST
  - últimas 20 mensagens (JSON strings)

luni:sess:{cliente}:{canal}:{userId}:locks → STRING
  - locks para operações críticas
```

### Chaves de Foco

```
luni:foco:{nomeArquivo}:ctx → HASH
  - focos (JSON), atualizado_em, nomeArquivo

luni:foco:{nomeArquivo}:exp → STRING
  - controle de expiração
```

## 🧪 Testes

### Executar Testes

```bash
# Testes completos da Fase A
node test_redis_fase_a.js

# Testes específicos
npm test
```

### Critérios de Aceite

- ✅ **Velocidade**: < 10ms por operação
- ✅ **Economia**: Resumo truncado em 400 chars
- ✅ **Memória**: TTL automático de 72h
- ✅ **Escala**: Locks funcionando
- ✅ **Compatibilidade**: API 100% compatível
- ✅ **Fallback**: Funciona sem Redis

## 📈 Benefícios Implementados

### 1. Velocidade ⚡

- **Antes**: Leitura/escrita em arquivos (100-500ms)
- **Depois**: Redis na RAM (1-5ms)
- **Ganho**: 20-100x mais rápido

### 2. Economia 💰

- **Janela deslizante**: Máximo 20 mensagens por sessão
- **Resumo inteligente**: Truncado em 400 chars
- **Redução estimada**: 20-40% menos tokens

### 3. Memória Inteligente 🧠

- **TTL automático**: 72h de expiração
- **Limpeza automática**: Sem arquivos pesados
- **LRU policy**: Remove dados menos usados

### 4. Escala e Robustez 🔒

- **Locks distribuídos**: Evita duplo agendamento
- **Múltiplas instâncias**: Compartilham estado
- **Fallback automático**: Funciona sem Redis

## 🔍 Monitoramento

### Sistema de Monitoramento Avançado (Fase C)

```bash
# Ativar monitoramento
MONITORING_ENABLED=1 node index.js

# Ver métricas em tempo real
node -e "import('./config/monitoring.js').then(m => m.default.getMetrics().then(console.log))"

# Gerar relatório de staging
node scripts/deploy-staging.js
```

### Métricas Disponíveis

- **Operações**: Total, sucesso, falha, latência média
- **Redis**: Hits, misses, erros, hit rate
- **Performance**: P95, P99, percentiles
- **Tokens**: Economizados, redução percentual
- **Alertas**: Thresholds automáticos

### Relatórios de Staging

```bash
# Deploy completo em staging
node scripts/deploy-staging.js deploy

# Ver status atual
node scripts/deploy-staging.js status

# Limpar dados de staging
node scripts/deploy-staging.js cleanup
```

### Métricas Redis

```bash
# Ver estatísticas
docker exec redis-luni redis-cli -a senha-forte info memory
docker exec redis-luni redis-cli -a senha-forte info stats
```

### Logs da Aplicação

```bash
# Logs detalhados
DEBUG=true node index.js

# Logs específicos
LOG_LEVEL=debug node index.js
```

## 🚨 Troubleshooting

### Problemas Comuns

#### 1. Redis não conecta
```bash
# Verificar se está rodando
docker ps | grep redis-luni

# Reiniciar se necessário
docker restart redis-luni
```

#### 2. Performance lenta
```bash
# Verificar uso de memória
docker exec redis-luni redis-cli -a senha-forte info memory

# Limpar cache se necessário
docker exec redis-luni redis-cli -a senha-forte flushall
```

#### 3. Fallback não funciona
```bash
# Verificar feature flag
echo $USE_REDIS

# Forçar fallback
USE_REDIS=0 node index.js
```

## 🔄 Rollback

### Rollback Rápido

```bash
# 1. Desabilitar Redis
USE_REDIS=0

# 2. Reiniciar aplicação
node index.js

# 3. Dados continuam em arquivos (fallback automático)
```

### Rollback Completo

```bash
# 1. Parar Redis
docker stop redis-luni

# 2. Remover container
docker rm redis-luni

# 3. Desabilitar feature flag
USE_REDIS=0
```

## 📋 Roadmap

### Fase A ✅ (Implementada)
- [x] Cliente Redis otimizado
- [x] SessionStore com fallback
- [x] FocoStore com fallback
- [x] Feature flag
- [x] Testes unitários
- [x] Setup automático

### Fase B ✅ (Implementada)
- [x] Store Adapter para compatibilidade
- [x] Integração no fluxo principal
- [x] Testes de integração
- [x] Compatibilidade total mantida
- [x] Performance otimizada
- [x] Fallback funcionando

### Fase C ✅ (Implementada)
- [x] Sistema de monitoramento avançado
- [x] Deploy em staging automatizado
- [x] Teste com clientes reais
- [x] Alertas e thresholds
- [x] Relatórios de performance
- [x] Recomendações automáticas

### Fase D 📅 (Futura)
- [ ] Deploy em produção
- [ ] Otimizações de performance
- [ ] Backup e recuperação
- [ ] Métricas avançadas

## 🤝 Contribuição

Para contribuir com a implementação:

1. Execute os testes: `node test_redis_fase_a.js`
2. Verifique compatibilidade com API existente
3. Teste fallback: `USE_REDIS=0 node index.js`
4. Documente mudanças

## 📞 Suporte

- **Issues**: Abra issue no repositório
- **Documentação**: Consulte este arquivo
- **Logs**: Use `DEBUG=true` para logs detalhados
