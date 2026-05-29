// Integração com a API do Google Calendar usando uma Service Account.
//
// Setup (resumido — passo a passo completo no README):
//   1. Crie um projeto no Google Cloud e ative a "Google Calendar API".
//   2. Crie uma Service Account, gere uma chave JSON e salve como ./credentials.json
//   3. Compartilhe sua agenda com o e-mail da Service Account (permissão
//      "Fazer alterações em eventos") e coloque o ID dela em GOOGLE_CALENDAR_ID.

const fs = require('fs')
const { google } = require('googleapis')
const { config } = require('./clinic')

const CREDENTIALS_PATH = process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json'
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'primary'
const TZ = config.timezone

let calendarClient = null

// Diz se o Google Calendar está pronto pra uso (credenciais presentes).
function isConfigured() {
  return fs.existsSync(CREDENTIALS_PATH)
}

function getClient() {
  if (calendarClient) return calendarClient
  const auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  })
  calendarClient = google.calendar({ version: 'v3', auth })
  return calendarClient
}

// ---------- Helpers de data/fuso ----------

// Retorna o offset do fuso (ex: "-03:00") para uma data, respeitando horário de verão.
function tzOffset(date) {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'shortOffset' })
  const name = dtf.formatToParts(date).find((p) => p.type === 'timeZoneName')?.value || 'GMT+0'
  const m = name.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/)
  if (!m) return '+00:00'
  return `${m[1]}${m[2].padStart(2, '0')}:${m[3] || '00'}`
}

const pad = (n) => String(n).padStart(2, '0')

// Monta um timestamp RFC3339 (com offset) a partir de uma data/hora local da clínica.
function toRFC3339(year, month, day, hour, min) {
  const probe = new Date(Date.UTC(year, month - 1, day, hour, min))
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(min)}:00${tzOffset(probe)}`
}

// Data de "hoje" no fuso da clínica, como { year, month, day }.
function todayInTz() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const get = (t) => Number(parts.find((p) => p.type === t).value)
  return { year: get('year'), month: get('month'), day: get('day') }
}

// Soma N dias a um { year, month, day } e devolve outro { year, month, day }.
function addDays({ year, month, day }, n) {
  const d = new Date(Date.UTC(year, month - 1, day + n))
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

function formatDateBR({ year, month, day }) {
  return `${pad(day)}/${pad(month)}/${year}`
}

// ---------- Operações de agenda ----------

// Lista os horários livres de um dia, em passos de `durationMin`, dentro do expediente.
async function getAvailableSlots(date) {
  const cal = getClient()
  const dayStart = toRFC3339(date.year, date.month, date.day, config.openHour, 0)
  const dayEnd = toRFC3339(date.year, date.month, date.day, config.closeHour, 0)

  const { data } = await cal.freebusy.query({
    requestBody: {
      timeMin: dayStart,
      timeMax: dayEnd,
      timeZone: TZ,
      items: [{ id: CALENDAR_ID }],
    },
  })
  const busy = data.calendars[CALENDAR_ID]?.busy || []

  const slots = []
  const stepMs = config.durationMin * 60 * 1000
  for (let h = config.openHour; h < config.closeHour; h++) {
    for (let m = 0; m < 60; m += config.durationMin) {
      const startStr = toRFC3339(date.year, date.month, date.day, h, m)
      const start = new Date(startStr).getTime()
      const end = start + stepMs
      const overlaps = busy.some((b) => {
        const bs = new Date(b.start).getTime()
        const be = new Date(b.end).getTime()
        return start < be && end > bs
      })
      if (!overlaps) slots.push({ hour: h, min: m, label: `${pad(h)}:${pad(m)}` })
    }
  }
  return slots
}

// Cria um evento de consulta na agenda. Retorna { link, label }.
async function createAppointment({ date, hour, min, paciente, servico, telefone }) {
  const cal = getClient()
  const startStr = toRFC3339(date.year, date.month, date.day, hour, min)
  const endMin = min + config.durationMin
  const endStr = toRFC3339(date.year, date.month, date.day, hour + Math.floor(endMin / 60), endMin % 60)

  const { data } = await cal.events.insert({
    calendarId: CALENDAR_ID,
    requestBody: {
      summary: `Consulta: ${paciente} (${servico})`,
      description:
        `Agendamento via WhatsApp (bot OdontoTech)\n` +
        `Paciente: ${paciente}\n` +
        `Serviço: ${servico}\n` +
        `Contato: ${telefone}`,
      start: { dateTime: startStr, timeZone: TZ },
      end: { dateTime: endStr, timeZone: TZ },
    },
  })

  return {
    link: data.htmlLink,
    label: `${formatDateBR(date)} às ${pad(hour)}:${pad(min)}`,
  }
}

module.exports = {
  isConfigured,
  getAvailableSlots,
  createAppointment,
  todayInTz,
  addDays,
  formatDateBR,
}
