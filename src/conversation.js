// Lógica de conversa do bot: menu de atendimento + fluxo de agendamento.
//
// Mantém uma "sessão" em memória por contato (remoteJid). Cada mensagem recebida
// passa por handleMessage(), que decide a resposta com base no estado atual.

const { clinic, config } = require('./clinic')
const calendar = require('./googleCalendar')
const ai = require('./ai')

// Estados do fluxo de agendamento.
const STATE = {
  MENU: 'MENU',
  ASK_NAME: 'ASK_NAME',
  ASK_SERVICE: 'ASK_SERVICE',
  ASK_DAY: 'ASK_DAY',
  ASK_SLOT: 'ASK_SLOT',
}

// sessões: jid -> { state, data, expiresAt }
const sessions = new Map()
const SESSION_TTL_MS = 15 * 60 * 1000 // 15 min de inatividade

function getSession(jid) {
  const s = sessions.get(jid)
  if (s && s.expiresAt > Date.now()) return s
  sessions.delete(jid)
  return null
}

function setSession(jid, state, data = {}) {
  sessions.set(jid, { state, data, expiresAt: Date.now() + SESSION_TTL_MS })
}

function clearSession(jid) {
  sessions.delete(jid)
}

// ---------- Textos prontos ----------

function menuText() {
  return (
    `🦷 *${clinic.nome}* — Atendimento\n\n` +
    `Como posso ajudar? Responda com o número:\n\n` +
    `*1* - Agendar consulta\n` +
    `*2* - Ver serviços\n` +
    `*3* - Endereço e horário\n` +
    `*4* - Falar com atendente\n\n` +
    `_(Digite *menu* a qualquer momento para voltar aqui, ou *cancelar* para encerrar.)_`
  )
}

function servicosText() {
  const lista = clinic.servicos.map((s, i) => `${i + 1}. ${s}`).join('\n')
  return `🦷 *Nossos serviços:*\n\n${lista}\n\nDigite *1* para agendar ou *menu* para voltar.`
}

function enderecoText() {
  return (
    `📍 *${clinic.nome}*\n\n` +
    `Endereço: ${clinic.endereco}\n` +
    `Telefone: ${clinic.telefone}\n` +
    `Horário: ${clinic.horarioTexto}\n\n` +
    `Digite *menu* para voltar.`
  )
}

// ---------- Helpers do fluxo ----------

const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

// Gera as próximas opções de dia (hoje + próximos dias), pulando fins de semana.
function buildDayOptions() {
  const opts = []
  let date = calendar.todayInTz()
  let offset = 0
  while (opts.length < 5 && offset < 14) {
    const d = offset === 0 ? date : calendar.addDays(date, offset)
    const dow = new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay()
    if (dow !== 0 && dow !== 6) {
      const label =
        offset === 0
          ? 'Hoje'
          : offset === 1
            ? 'Amanhã'
            : WEEKDAYS[dow].charAt(0).toUpperCase() + WEEKDAYS[dow].slice(1)
      opts.push({ date: d, label: `${label} (${calendar.formatDateBR(d)})` })
    }
    offset++
  }
  return opts
}

function parseChoice(texto, max) {
  const n = parseInt(texto.trim(), 10)
  if (Number.isInteger(n) && n >= 1 && n <= max) return n
  return null
}

// ---------- Roteador principal ----------

async function handleMessage(jid, textoRaw) {
  const texto = (textoRaw || '').trim()
  const lower = texto.toLowerCase()

  // Comandos globais
  if (['cancelar', 'sair', 'parar'].includes(lower)) {
    clearSession(jid)
    return 'Tudo bem, atendimento encerrado. Quando quiser, é só mandar *oi*! 👋'
  }
  if (['menu', 'oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'início', 'inicio'].includes(lower)) {
    setSession(jid, STATE.MENU)
    return menuText()
  }

  const session = getSession(jid)

  // Sem sessão ativa: tenta entender pelo menu; senão cai na IA (se ligada) ou mostra menu.
  if (!session) {
    return firstContact(jid, texto)
  }

  switch (session.state) {
    case STATE.MENU:
      return handleMenuChoice(jid, texto)
    case STATE.ASK_NAME:
      return handleName(jid, texto)
    case STATE.ASK_SERVICE:
      return handleService(jid, texto)
    case STATE.ASK_DAY:
      return handleDay(jid, texto)
    case STATE.ASK_SLOT:
      return handleSlot(jid, texto)
    default:
      setSession(jid, STATE.MENU)
      return menuText()
  }
}

async function firstContact(jid, texto) {
  // Se a pessoa já mandou um número de menu logo de cara, atende.
  if (parseChoice(texto, 4)) {
    setSession(jid, STATE.MENU)
    return handleMenuChoice(jid, texto)
  }
  // Tenta IA pra perguntas livres; se desligada, mostra o menu.
  const respostaIA = await ai.responder(texto)
  if (respostaIA) {
    return `${respostaIA}\n\n_Digite *menu* para ver as opções de atendimento._`
  }
  setSession(jid, STATE.MENU)
  return `Olá! 👋 Seja bem-vindo(a) à *${clinic.nome}*.\n\n${menuText()}`
}

async function handleMenuChoice(jid, texto) {
  const op = parseChoice(texto, 4)
  if (!op) {
    // Fora do menu: IA se disponível, senão repete o menu.
    const respostaIA = await ai.responder(texto)
    if (respostaIA) return `${respostaIA}\n\n_Digite *menu* para ver as opções._`
    return `Não entendi. 🤔\n\n${menuText()}`
  }

  if (op === 1) {
    if (!calendar.isConfigured()) {
      clearSession(jid)
      return (
        '⚠️ O agendamento online ainda não está disponível.\n' +
        `Por favor, ligue para ${clinic.telefone}.`
      )
    }
    setSession(jid, STATE.ASK_NAME)
    return 'Ótimo! Vamos agendar sua consulta. 😁\n\nPrimeiro, qual é o seu *nome completo*?'
  }
  if (op === 2) return servicosText()
  if (op === 3) return enderecoText()
  if (op === 4) {
    clearSession(jid)
    return (
      `Sem problemas! Um de nossos atendentes vai falar com você. 🧑‍⚕️\n` +
      `Se preferir, ligue para ${clinic.telefone}.`
    )
  }
}

function handleName(jid, texto) {
  if (texto.length < 2) return 'Por favor, digite seu *nome completo*.'
  const data = { paciente: texto }
  setSession(jid, STATE.ASK_SERVICE, data)
  const lista = clinic.servicos.map((s, i) => `*${i + 1}* - ${s}`).join('\n')
  return `Prazer, ${texto.split(' ')[0]}! 😊\n\nQual *serviço* você deseja?\n\n${lista}`
}

function handleService(jid, texto) {
  const session = getSession(jid)
  const op = parseChoice(texto, clinic.servicos.length)
  if (!op) return `Escolha um número de *1* a *${clinic.servicos.length}*, por favor.`
  const data = { ...session.data, servico: clinic.servicos[op - 1] }
  const dias = buildDayOptions()
  data.dias = dias
  setSession(jid, STATE.ASK_DAY, data)
  const lista = dias.map((d, i) => `*${i + 1}* - ${d.label}`).join('\n')
  return `Perfeito! Para qual *dia*?\n\n${lista}`
}

async function handleDay(jid, texto) {
  const session = getSession(jid)
  const dias = session.data.dias || buildDayOptions()
  const op = parseChoice(texto, dias.length)
  if (!op) return `Escolha um número de *1* a *${dias.length}*, por favor.`

  const escolhido = dias[op - 1]
  let slots
  try {
    slots = await calendar.getAvailableSlots(escolhido.date)
  } catch (err) {
    console.error('Erro ao buscar horários:', err.message)
    return '😣 Tive um problema ao consultar a agenda. Tente novamente em instantes ou digite *menu*.'
  }

  if (!slots.length) {
    return `Não há horários livres em *${escolhido.label}*. 😕\nEscolha outro dia da lista acima.`
  }

  // Mostra no máximo 12 horários pra não poluir.
  const mostrados = slots.slice(0, 12)
  const data = { ...session.data, date: escolhido.date, slots: mostrados }
  setSession(jid, STATE.ASK_SLOT, data)
  const lista = mostrados.map((s, i) => `*${i + 1}* - ${s.label}`).join('\n')
  return `Horários livres em *${escolhido.label}*:\n\n${lista}\n\nQual horário você prefere?`
}

async function handleSlot(jid, texto) {
  const session = getSession(jid)
  const slots = session.data.slots || []
  const op = parseChoice(texto, slots.length)
  if (!op) return `Escolha um número de *1* a *${slots.length}*, por favor.`

  const slot = slots[op - 1]
  try {
    const result = await calendar.createAppointment({
      date: session.data.date,
      hour: slot.hour,
      min: slot.min,
      paciente: session.data.paciente,
      servico: session.data.servico,
      telefone: jid.split('@')[0],
    })
    clearSession(jid)
    return (
      `✅ *Consulta agendada com sucesso!*\n\n` +
      `👤 ${session.data.paciente}\n` +
      `🦷 ${session.data.servico}\n` +
      `📅 ${result.label}\n\n` +
      `Qualquer coisa, mande *oi* para falar com a gente. Até breve! 😁`
    )
  } catch (err) {
    console.error('Erro ao criar evento:', err.message)
    return '😣 Não consegui concluir o agendamento. Tente novamente ou ligue para a clínica.'
  }
}

module.exports = { handleMessage }
