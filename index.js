require('dotenv').config()

const makeWASocket = require('@whiskeysockets/baileys').default
const { useMultiFileAuthState, DisconnectReason, fetchLatestWaWebVersion } = require('@whiskeysockets/baileys')
const qrcode = require('qrcode-terminal')

const { handleMessage } = require('./src/conversation')
const calendar = require('./src/googleCalendar')
const ai = require('./src/ai')

async function conectar() {
  const { state, saveCreds } = await useMultiFileAuthState('auth')
  const { version } = await fetchLatestWaWebVersion()
  console.log(`Usando WhatsApp Web v${version.join('.')}`)
  console.log(`Google Calendar: ${calendar.isConfigured() ? 'configurado ✅' : 'NÃO configurado ⚠️ (agendamento desativado)'}`)
  console.log(`IA (Groq): ${ai.isEnabled() ? 'ativada ✅' : 'desativada (só menu)'}`)

  const sock = makeWASocket({ version, auth: state })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
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

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return
    const msg = messages[0]
    if (!msg?.message || msg.key.fromMe) return

    const remetente = msg.key.remoteJid
    // Ignora grupos e status/broadcast — atende só conversas individuais.
    if (!remetente || remetente.endsWith('@g.us') || remetente === 'status@broadcast') return

    const texto = msg.message.conversation || msg.message.extendedTextMessage?.text
    if (!texto) return

    console.log(`📩 ${remetente}: ${texto}`)

    try {
      const resposta = await handleMessage(remetente, texto)
      if (resposta) {
        await sock.sendMessage(remetente, { text: resposta })
      }
    } catch (err) {
      console.error('Erro ao processar mensagem:', err)
      await sock.sendMessage(remetente, {
        text: '😣 Ops, tive um problema aqui. Digite *menu* para tentar de novo.',
      })
    }
  })
}

conectar()
