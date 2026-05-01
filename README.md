# meu-bot

Bot para WhatsApp construído com Node.js usando a biblioteca [Baileys](https://github.com/WhiskeySockets/Baileys), que emula o WhatsApp Web para automatizar mensagens sem depender de API oficial.

---

## Funcionalidades

- Conecta ao WhatsApp via QR Code (igual ao WhatsApp Web)
- Persiste a sessão na pasta `auth/` para não precisar autenticar novamente
- Reconecta automaticamente em caso de queda de conexão
- Escuta mensagens recebidas e responde automaticamente
- Responde com **"Olá! 👋"** quando alguém envia **"oi"**

---

## Tecnologias

| Tecnologia | Uso |
|---|---|
| Node.js | Runtime JavaScript |
| @whiskeysockets/baileys | Conexão com WhatsApp Web |
| qrcode-terminal | Exibe o QR Code no terminal |
| @hapi/boom | Tratamento de erros HTTP |

---

## Estrutura do Projeto

```
meu-bot/
├── index.js          # Lógica principal do bot
├── package.json      # Dependências e configurações do projeto
├── auth/             # Credenciais de sessão do WhatsApp (gerado em runtime)
└── node_modules/     # Pacotes instalados
```

---

## Como Usar

### 1. Instale as dependências

```bash
npm install
```

### 2. Inicie o bot

```bash
node index.js
```

### 3. Autentique com o WhatsApp

Um QR Code será exibido no terminal. Abra o WhatsApp no celular, vá em **Dispositivos conectados** e escaneie o código.

### 4. Teste o bot

Envie **"oi"** para o número do WhatsApp conectado e o bot responderá com **"Olá! 👋"**.

---

## Como Funciona

### Conexão

O bot usa a função `makeWASocket` do Baileys para abrir uma conexão WebSocket com os servidores do WhatsApp Web. As credenciais de autenticação são salvas na pasta `auth/` via `useMultiFileAuthState`, permitindo retomar a sessão sem novo login.

### Reconexão Automática

Se a conexão cair por qualquer motivo que não seja logout manual, o bot chama `conectar()` novamente automaticamente.

### Processamento de Mensagens

O bot escuta o evento `messages.upsert` do Baileys. Para cada mensagem recebida:

1. Ignora mensagens enviadas pelo próprio bot
2. Extrai o texto da mensagem (suporta mensagens normais e texto estendido)
3. Verifica se o texto é `"oi"` (sem diferenciar maiúsculas/minúsculas)
4. Envia `"Olá! 👋"` de volta para a mesma conversa

---

## Adicionando Novos Comandos

No arquivo [index.js](index.js), localize o bloco de processamento de mensagens e adicione novos `if` para novos gatilhos:

```js
if (texto === 'oi') {
    await sock.sendMessage(from, { text: 'Olá! 👋' });
}

// Exemplo de novo comando:
if (texto === 'ajuda') {
    await sock.sendMessage(from, { text: 'Comandos disponíveis: oi, ajuda' });
}
```

---

## Observacoes

- A pasta `auth/` é criada automaticamente na primeira execução e deve ser mantida para preservar a sessão.
- O bot utiliza uma versão Release Candidate do Baileys (`v7.0.0-rc.9`), então pode haver mudanças na API em versões futuras.
- Este projeto não utiliza a API oficial do WhatsApp Business, portanto está sujeito aos Termos de Serviço do WhatsApp.
