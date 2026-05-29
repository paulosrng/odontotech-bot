# 🦷 OdontoTech Bot

Bot de WhatsApp para a clínica **OdontoTech**: faz atendimento por menu e **agenda consultas direto no Google Agenda**.

Construído com [Baileys](https://github.com/WhiskeySockets/Baileys) (WhatsApp), [googleapis](https://www.npmjs.com/package/googleapis) (Google Calendar) e, opcionalmente, [Groq](https://groq.com) como cérebro de IA.

## ✨ O que o bot faz

- **Menu de atendimento** (responde por número):
  1. Agendar consulta
  2. Ver serviços
  3. Endereço e horário
  4. Falar com atendente
- **Fluxo de agendamento completo**: pergunta nome → serviço → dia → horário, consulta os **horários livres na sua agenda** e **cria o evento** no Google Calendar.
- **Comandos globais**: `menu`, `oi`, `cancelar`.
- **IA opcional (Groq)**: responde perguntas livres fora do menu. Só liga se você definir a `GROQ_API_KEY`; sem ela, o bot funciona normal só com o menu.

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

## 🤖 Configurar a IA (Groq) — opcional

1. Crie uma conta grátis na [Groq](https://console.groq.com/keys) e gere uma API key.
2. Coloque em `GROQ_API_KEY` no `.env`. (O modelo padrão é `llama-3.3-70b-versatile`.)

## ▶️ Rodar

```bash
npm start
```

Na primeira vez, um **QR Code** aparece no terminal — escaneie com o WhatsApp (Aparelhos conectados → Conectar aparelho). A sessão fica salva na pasta `auth/`, então nas próximas vezes conecta sozinho.

Ao iniciar, o terminal mostra o status:

```
Google Calendar: configurado ✅
IA (Groq): ativada ✅
```

## 🗂️ Estrutura

```
index.js                 # conexão com o WhatsApp (Baileys) + roteamento de mensagens
src/clinic.js            # dados da clínica e config (horário, fuso, duração)
src/googleCalendar.js    # integração com a Google Calendar API
src/ai.js                # integração opcional com a Groq
src/conversation.js      # menu + máquina de estados do agendamento
.env.example             # modelo das variáveis de ambiente
```

## ✏️ Personalizar

- **Dados da clínica** (nome, endereço, serviços): edite [`src/clinic.js`](src/clinic.js).
- **Horário de funcionamento / duração da consulta**: variáveis no `.env` (`CLINIC_OPEN_HOUR`, `CLINIC_CLOSE_HOUR`, `APPOINTMENT_DURATION_MIN`).

## ⚠️ Observações

- Usa uma versão Release Candidate do Baileys (`v7.x-rc`); a API pode mudar em versões futuras.
- Não usa a API oficial do WhatsApp Business — está sujeito aos Termos do WhatsApp. Use um número de teste.
