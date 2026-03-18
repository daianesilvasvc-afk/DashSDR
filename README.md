# Dashboard SDRs — Podium Educação

Dashboard de métricas dos SDRs integrado ao Pipedrive.

## Deploy no Railway (gratuito)

### 1. Crie uma conta
Acesse https://railway.app e crie uma conta gratuita (pode usar o Google).

### 2. Novo projeto
- Clique em **New Project**
- Escolha **Deploy from GitHub repo** OU **Empty Project**

### 3. Via GitHub (recomendado)
1. Faça upload desta pasta para um repositório no GitHub
2. No Railway, conecte o repositório
3. O Railway detecta automaticamente o Node.js

### 4. Configure a variável de ambiente
No Railway, vá em **Variables** e adicione:
```
PIPEDRIVE_API_KEY = sua_chave_api_aqui
```

### 5. Deploy
O Railway faz o deploy automaticamente. Em ~2 minutos você terá uma URL pública como:
```
https://podium-dashboard.up.railway.app
```

## Estrutura do projeto
```
podium-dashboard/
├── server.js          # Backend Node.js (busca dados do Pipedrive)
├── package.json       # Dependências
└── public/
    └── index.html     # Frontend do dashboard
```

## Variáveis de ambiente necessárias
| Variável | Descrição |
|----------|-----------|
| `PIPEDRIVE_API_KEY` | Chave de API do Pipedrive (Configurações → Integrações) |
| `PORT` | Porta do servidor (Railway define automaticamente) |

## SDRs monitorados
O dashboard monitora automaticamente estes SDRs:
- Edrius Vieira
- Fernanda Piemonte
- João Madeira
- Kauai Moro
- Kevin Amaro de Sousa
- Lais
- Luiz Roos
- Nátali Helena
- Samuel
- Thiago Palivoda

## Meta mensal
**80 atividades realizadas por SDR**
Contam para a meta: Reunião realizada + Venda pelo SDR
