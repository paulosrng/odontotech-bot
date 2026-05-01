const makeWASocket = require('@whiskeysockets/baileys').default
const { useMultiFileAuthState, DisconnectReason, fetchLatestWaWebVersion } = require('@whiskeysockets/baileys')
const { Boom } = require('@hapi/boom')
const qrcode = require('qrcode-terminal')

async function conectar() {
  const { state, saveCreds } = await useMultiFileAuthState('auth')
  const { version } = await fetchLatestWaWebVersion()
  console.log(`Usando WhatsApp Web v${version.join('.')}`)

  const sock = makeWASocket({
    version,
    auth: state
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    // Mostra o QR quando disponível
    if (qr) {
      qrcode.generate(qr, { small: true })
      console.log('Escaneia o QR acima com o WhatsApp!')
    }

    if (connection === 'close') {
      const deveReconectar = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
      if (deveReconectar) conectar()
      else console.log('Deslogado. Apague a pasta auth/ e rode novamente.')
    } else if (connection === 'open') {
      console.log('✅ Conectado!')
    }
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0]
    if (!msg.key.fromMe && msg.message) {
      const texto = msg.message.conversation || msg.message.extendedTextMessage?.text
      const remetente = msg.key.remoteJid

      console.log(`Mensagem de ${remetente}: ${texto}`)

      if (texto?.toLowerCase() === 'oi') {
        await sock.sendMessage(remetente, { text: 'Olá! 👋' })
      }
    }
  })
}

conectar()