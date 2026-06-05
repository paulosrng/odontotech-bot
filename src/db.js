// Camada de banco de dados (Supabase / Postgres).
// Guarda pacientes, agendamentos e o histórico de conversa (memória da IA).
//
// Se SUPABASE_URL / SUPABASE_KEY não estiverem definidos, o bot continua
// funcionando — só fica sem memória/persistência (modo degradado).

require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')

const URL = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_KEY

let supabase = null
if (URL && KEY) supabase = createClient(URL, KEY, { auth: { persistSession: false } })

function isConfigured() {
  return Boolean(supabase)
}

// Últimas mensagens de um contato, em ordem cronológica (p/ contexto da IA).
async function getRecentMessages(phone, limit = 10) {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('messages')
    .select('role, content')
    .eq('phone', phone)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) {
    console.error('Supabase getRecentMessages:', error.message)
    return []
  }
  return (data || []).reverse()
}

async function saveMessage(phone, role, content) {
  if (!supabase) return
  const { error } = await supabase.from('messages').insert({ phone, role, content })
  if (error) console.error('Supabase saveMessage:', error.message)
}

// Cria/atualiza o paciente daquele número.
async function upsertPatient(phone, name) {
  if (!supabase) return
  const { error } = await supabase
    .from('patients')
    .upsert({ phone, name }, { onConflict: 'phone' })
  if (error) console.error('Supabase upsertPatient:', error.message)
}

async function saveAppointment(appt) {
  if (!supabase) return
  const { error } = await supabase.from('appointments').insert(appt)
  if (error) console.error('Supabase saveAppointment:', error.message)
}

module.exports = {
  isConfigured,
  getRecentMessages,
  saveMessage,
  upsertPatient,
  saveAppointment,
}
