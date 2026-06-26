// Camada de banco de dados (SQLite, via better-sqlite3).
// Guarda pacientes, agendamentos e o histórico de conversa (memória da IA).
//
// Não precisa de servidor, conta nem credenciais: os dados ficam num arquivo
// local (odontotech.db) e as tabelas são criadas automaticamente na 1ª execução.

const path = require('path')
const Database = require('better-sqlite3')

const DB_PATH = process.env.SQLITE_PATH || path.join(__dirname, '..', 'odontotech.db')

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')

// Cria as tabelas se ainda não existirem.
db.exec(`
  CREATE TABLE IF NOT EXISTS patients (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    phone       TEXT UNIQUE NOT NULL,
    name        TEXT,
    created_at  TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS appointments (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    phone             TEXT NOT NULL,
    patient_name      TEXT,
    service           TEXT,
    start_time        TEXT NOT NULL,
    end_time          TEXT,
    calendar_event_id TEXT,
    status            TEXT DEFAULT 'confirmado',
    created_at        TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    phone       TEXT NOT NULL,
    role        TEXT NOT NULL,
    content     TEXT,
    created_at  TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_messages_phone ON messages (phone, created_at);
  CREATE INDEX IF NOT EXISTS idx_appointments_phone ON appointments (phone, created_at);
`)

// Com SQLite o banco está sempre pronto (arquivo local).
function isConfigured() {
  return true
}

// Últimas mensagens de um contato, em ordem cronológica (p/ contexto da IA).
async function getRecentMessages(phone, limit = 10) {
  try {
    const rows = db
      .prepare('SELECT role, content FROM messages WHERE phone = ? ORDER BY id DESC LIMIT ?')
      .all(phone, limit)
    return rows.reverse()
  } catch (err) {
    console.error('SQLite getRecentMessages:', err.message)
    return []
  }
}

async function saveMessage(phone, role, content) {
  try {
    db.prepare('INSERT INTO messages (phone, role, content) VALUES (?, ?, ?)').run(phone, role, content)
  } catch (err) {
    console.error('SQLite saveMessage:', err.message)
  }
}

// Cria/atualiza o paciente daquele número.
async function upsertPatient(phone, name) {
  try {
    db.prepare(
      `INSERT INTO patients (phone, name) VALUES (?, ?)
       ON CONFLICT(phone) DO UPDATE SET name = excluded.name`
    ).run(phone, name)
  } catch (err) {
    console.error('SQLite upsertPatient:', err.message)
  }
}

async function saveAppointment(appt) {
  try {
    db.prepare(
      `INSERT INTO appointments (phone, patient_name, service, start_time, end_time, calendar_event_id, status)
       VALUES (@phone, @patient_name, @service, @start_time, @end_time, @calendar_event_id, @status)`
    ).run(appt)
  } catch (err) {
    console.error('SQLite saveAppointment:', err.message)
  }
}

// Consultas confirmadas e futuras de um número (p/ consultar/cancelar).
async function getUpcomingAppointments(phone) {
  try {
    const rows = db
      .prepare(
        `SELECT id, patient_name, service, start_time, calendar_event_id
         FROM appointments WHERE phone = ? AND status = 'confirmado'
         ORDER BY start_time ASC`
      )
      .all(phone)
    const agora = Date.now()
    return rows.filter((r) => new Date(r.start_time).getTime() >= agora)
  } catch (err) {
    console.error('SQLite getUpcomingAppointments:', err.message)
    return []
  }
}

// Marca uma consulta como cancelada.
async function cancelAppointment(id) {
  try {
    db.prepare("UPDATE appointments SET status = 'cancelado' WHERE id = ?").run(id)
  } catch (err) {
    console.error('SQLite cancelAppointment:', err.message)
  }
}

module.exports = {
  isConfigured,
  getRecentMessages,
  saveMessage,
  upsertPatient,
  saveAppointment,
  getUpcomingAppointments,
  cancelAppointment,
}
