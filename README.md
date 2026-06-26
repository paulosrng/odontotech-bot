# 🦷 OdontoTech Bot

Atendente virtual de WhatsApp para a clínica **OdontoTech**: conversa de forma **100% natural por IA** (sem menus) e **agenda consultas direto no Google Agenda**, guardando tudo num banco de dados.

Construído com [Baileys](https://github.com/WhiskeySockets/Baileys) (WhatsApp), [Ollama](https://ollama.com) (LLM local com function calling — ou [Groq](https://groq.com) na nuvem), [googleapis](https://www.npmjs.com/package/googleapis) (Google Calendar) e [SQLite](https://github.com/WiseLibs/better-sqlite3) (banco de dados local).

## ✨ O que o bot faz

- **Atendimento humanizado 100% por IA**: a recepcionista virtual (*Sofia*) conversa naturalmente, como uma pessoa de verdade — sem menus nem comandos.
- **Mantém o personagem**: recusa com bom humor pedidos fora do contexto (ex: "escreve um código pra mim") e nunca diz que é uma IA.
- **Agendamento por function calling**: a IA chama funções reais para **consultar horários livres** e **criar o evento** no Google Calendar — nunca inventa horários.
- **Memória de conversa**: o histórico fica no banco, então a IA lembra do contexto e soa natural ao longo da conversa.
- **Banco de dados (SQLite)**: guarda pacientes, agendamentos e o histórico de mensagens num arquivo local — sem servidor nem conta.

## 🚀 Instalação

```bash
npm install
cp .env.example .env   # depois edite o .env
```

## ⚙️ Configurar o Google Calendar (Service Account)

1. Acesse o [Google Cloud Console](https://console.cloud.google.com/) e crie um projeto.
2. Em **APIs e serviços → Biblioteca**, ative a **Google Calendar API**.
3. Em **APIs e serviços → Credenciais → Criar credenciais → Conta de serviço**. Crie a conta.
4. Abra a conta de serviço criada → aba **Chaves → Adicionar chave → Criar nova chave → JSON**. Baixe o arquivo e salve como **`credentials.json`** na raiz do projeto.
5. Copie o **e-mail** da conta de serviço (algo como `nome@projeto.iam.gserviceaccount.com`).
6. Abra o [Google Agenda](https://calendar.google.com/) → **Configurações** da agenda que você quer usar → **Compartilhar com pessoas específicas** → adicione o e-mail da conta de serviço com a permissão **"Fazer alterações em eventos"**.
7. Ainda nas configurações da agenda, copie o **ID da agenda** (seção "Integrar agenda") e cole em `GOOGLE_CALENDAR_ID` no `.env`.

> O `credentials.json` e o `.env` **não vão pro Git** (já estão no `.gitignore`). Nunca suba esses arquivos.

## 🤖 Configurar a IA (cérebro do bot) — obrigatório

A IA é o cérebro do bot. Você escolhe entre rodar **local** (Ollama, offline) ou na **nuvem** (Groq),
pela variável `LLM_PROVIDER` no `.env`.

### Opção A — Local com Ollama (padrão, offline)

> Recomendado: roda na sua máquina, sem internet nem custo. Precisa de um Mac/PC com RAM suficiente
> (o `gpt-oss:20b` usa ~16GB; para máquinas mais modestas use um modelo menor como `qwen2.5:7b`).

1. Instale o [Ollama](https://ollama.com) (no Mac: `brew install ollama`).
2. Ligue o servidor: `ollama serve` (deixe rodando) — ou `brew services start ollama`.
3. Baixe o modelo: `ollama pull gpt-oss:20b`
4. No `.env`: `LLM_PROVIDER=local` e `OLLAMA_MODEL=gpt-oss:20b`.

### Opção B — Nuvem com Groq

> Não pesa na sua máquina, mas depende de internet e de uma API key.

1. Crie uma conta grátis na [Groq](https://console.groq.com/keys) e gere uma API key.
2. No `.env`: `LLM_PROVIDER=groq`, `GROQ_API_KEY=...` e `GROQ_MODEL=llama-3.3-70b-versatile`.

## 🗄️ Banco de dados (SQLite) — nada a configurar

O bot usa **SQLite**: na primeira execução ele cria sozinho o arquivo `odontotech.db`
na raiz do projeto, com as tabelas `patients`, `appointments` e `messages`.
Não precisa de servidor, conta nem credenciais. ✅

## ▶️ Rodar

```bash
npm start
```

Na primeira vez, um **QR Code** aparece no terminal — escaneie com o WhatsApp (Aparelhos conectados → Conectar aparelho). A sessão fica salva na pasta `auth/`, então nas próximas vezes conecta sozinho.

Ao iniciar, o terminal mostra o status:

```
Google Calendar: configurado ✅
IA: local (gpt-oss:20b) ✅
Banco (SQLite): pronto ✅
```

## 🗂️ Estrutura

```
index.js                 # conexão com o WhatsApp (Baileys) + roteamento de mensagens
src/clinic.js            # dados da clínica, persona e config (horário, fuso, duração)
src/ai.js                # cérebro: IA (Ollama local ou Groq) com function calling + persona
src/googleCalendar.js    # integração com a Google Calendar API
src/db.js                # camada de banco de dados (SQLite)
src/conversation.js      # ponto de entrada das mensagens (encaminha pra IA)
odontotech.db            # banco SQLite (criado automaticamente; fora do Git)
.env.example             # modelo das variáveis de ambiente
```

## ✏️ Personalizar

- **Dados da clínica** (nome, endereço, serviços) e **nome/personalidade da atendente**: edite [`src/clinic.js`](src/clinic.js).
- **Tom e regras da IA**: o "system prompt" fica em [`src/ai.js`](src/ai.js).
- **Horário de funcionamento / duração da consulta**: variáveis no `.env` (`CLINIC_OPEN_HOUR`, `CLINIC_CLOSE_HOUR`, `APPOINTMENT_DURATION_MIN`).

## 🚑 Resolução de problemas

### O bot conecta mas não responde às mensagens

Quase sempre é um destes dois motivos:

**1. Dois bots rodando ao mesmo tempo** ⚠️
Se você rodar `npm start` em mais de um terminal (ou em duas máquinas) usando a mesma
conta do WhatsApp, as sessões **brigam pela conexão** e nenhuma responde.
- **Regra:** só **um** `npm start` por vez.
- Se acontecer, pare todos (`Ctrl + C` em cada terminal) e deixe **só um** rodando.

**2. Sessão antiga/corrompida** 🔄
Se a sessão salva (pasta `auth/`) ficou parada por muito tempo, o bot conecta mas
para de receber mensagens novas. A solução é **reparear do zero**:

1. Pare o bot: `Ctrl + C`
2. Apague a sessão antiga:
   ```bash
   rm -rf auth
   ```
   (no Windows: apague a pasta `auth` manualmente)
3. Suba de novo: `npm start`
4. Escaneie o **QR Code novo** com o WhatsApp (Aparelhos conectados → Conectar aparelho)

> Apagar a pasta `auth/` só remove a "credencial de login" do WhatsApp — é seguro.
> Os dados do bot (pacientes, agendamentos) ficam no `odontotech.db` e **não são afetados**.

### A IA não responde / dá erro de conexão (modo local)

Se estiver usando `LLM_PROVIDER=local`, o **Ollama precisa estar rodando** e o modelo baixado:

```bash
ollama serve              # liga o servidor (ou: brew services start ollama)
ollama pull gpt-oss:20b   # baixa o modelo (só na primeira vez)
ollama list               # confere os modelos baixados
```

> Quem for rodar o bot em **modo local** precisa ter o Ollama instalado e o modelo baixado
> na própria máquina. Quem não quiser (ou tiver máquina mais fraca) pode usar `LLM_PROVIDER=groq`.

## ⚠️ Observações

- Usa uma versão Release Candidate do Baileys (`v7.x-rc`); a API pode mudar em versões futuras.
- Não usa a API oficial do WhatsApp Business — está sujeito aos Termos do WhatsApp. Use um número de teste.
