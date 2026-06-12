// Ponto de entrada das mensagens. Agora o atendimento é 100% por IA:
// não há mais menu nem máquina de estados — a IA conduz a conversa e agenda.

const ai = require('./ai')
const { clinic } = require('./clinic')

async function handleMessage(jid, texto) {
  const phone = jid.split('@')[0]

  const resposta = await ai.conversar(phone, texto)
  if (resposta) return resposta

  // Fallback caso a IA esteja desativada ou indisponível.
  return (
    `Oi! 😊 Estou com um probleminha técnico pra responder agora. ` +
    `Tenta de novo daqui a pouco, ou liga pra ${clinic.telefone} que a gente te atende!`
  )
}

module.exports = { handleMessage }
