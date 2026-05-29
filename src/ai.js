// Integração OPCIONAL com a Groq (https://groq.com).
// Serve de "cérebro" para responder perguntas livres que fogem do menu.
// Se GROQ_API_KEY não estiver definida, o bot ignora a IA e segue só com o menu.

const Groq = require('groq-sdk')
const { clinic } = require('./clinic')

const API_KEY = process.env.GROQ_API_KEY
const MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'

let groq = null
if (API_KEY) groq = new Groq({ apiKey: API_KEY })

function isEnabled() {
  return Boolean(groq)
}

const systemPrompt =
  `Você é a atendente virtual da clínica odontológica ${clinic.nome}. ` +
  `Responda em português do Brasil, de forma curta, simpática e objetiva (no máximo 3 frases). ` +
  `Dados da clínica:\n` +
  `- Endereço: ${clinic.endereco}\n` +
  `- Telefone: ${clinic.telefone}\n` +
  `- Horário: ${clinic.horarioTexto}\n` +
  `- Serviços: ${clinic.servicos.join(', ')}\n` +
  `Se o paciente quiser marcar, remarcar ou cancelar consulta, oriente-o a digitar "menu" ` +
  `e escolher a opção de agendamento. Nunca invente preços ou horários específicos.`

// Gera uma resposta da IA para um texto livre. Retorna null se a IA estiver desativada ou falhar.
async function responder(texto) {
  if (!groq) return null
  try {
    const res = await groq.chat.completions.create({
      model: MODEL,
      temperature: 0.5,
      max_tokens: 200,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: texto },
      ],
    })
    return res.choices[0]?.message?.content?.trim() || null
  } catch (err) {
    console.error('Erro na Groq:', err.message)
    return null
  }
}

module.exports = { isEnabled, responder }
