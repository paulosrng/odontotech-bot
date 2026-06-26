// Cérebro do bot: conversa 100% por IA com persona humanizada.
// A IA conversa naturalmente e usa "function calling" para executar ações
// reais: consultar horários e agendar consultas (Google Calendar + SQLite).
//
// Funciona com 2 provedores (escolhidos por LLM_PROVIDER no .env):
//   - "local": LLM rodando na máquina via Ollama (padrão, offline)
//   - "groq":  API da Groq (nuvem)
// Ambos usam a mesma API compatível com OpenAI, então o código é o mesmo.

const OpenAI = require('openai')
const { clinic, config } = require('./clinic')
const calendar = require('./googleCalendar')
const db = require('./db')

const PROVIDER = (process.env.LLM_PROVIDER || 'local').toLowerCase()

let client = null
let MODEL = null

if (PROVIDER === 'groq') {
  // Nuvem (Groq) — usa a API compatível com OpenAI.
  if (process.env.GROQ_API_KEY) {
    client = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
    })
    MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'
  }
} else {
  // Local (Ollama) — endpoint local, não precisa de chave de verdade.
  client = new OpenAI({
    apiKey: 'ollama', // ignorado pelo Ollama, mas o cliente exige algo
    baseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1',
  })
  MODEL = process.env.OLLAMA_MODEL || 'gpt-oss:20b'
}

function isEnabled() {
  return Boolean(client)
}

// Para o log de inicialização mostrar o que está em uso.
function info() {
  return { provider: PROVIDER, model: MODEL }
}

const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']

// ---------- Ferramentas que a IA pode chamar ----------

const tools = [
  {
    type: 'function',
    function: {
      name: 'verificar_horarios',
      description:
        'Consulta os horários REAIS livres da clínica em uma data. Use SEMPRE antes de oferecer ou confirmar um horário — nunca invente horários.',
      parameters: {
        type: 'object',
        properties: {
          data: { type: 'string', description: 'Data desejada no formato AAAA-MM-DD' },
        },
        required: ['data'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'agendar_consulta',
      description:
        'Cria a consulta na agenda da clínica. Só chame quando já tiver: nome do paciente, serviço, data e horário, e o paciente tiver confirmado.',
      parameters: {
        type: 'object',
        properties: {
          nome: { type: 'string', description: 'Nome do paciente' },
          servico: { type: 'string', description: 'Serviço desejado (ex: limpeza, avaliação)' },
          data: { type: 'string', description: 'Data no formato AAAA-MM-DD' },
          hora: { type: 'string', description: 'Horário no formato HH:MM (24h)' },
        },
        required: ['nome', 'servico', 'data', 'hora'],
      },
    },
  },
]

function parseISODate(s) {
  const [year, month, day] = String(s).split('-').map(Number)
  return { year, month, day }
}

// Fallback: alguns modelos Llama emitem a chamada de função como TEXTO,
// no formato <function=nome>{...}</function>. Extraímos essas chamadas aqui.
const TEXT_TOOL_RE = /<function=([a-zA-Z_]+)>\s*(\{[\s\S]*?\})\s*(?:<\/function>)?/g

function parseTextToolCalls(content) {
  if (!content) return []
  const calls = []
  let m
  TEXT_TOOL_RE.lastIndex = 0
  while ((m = TEXT_TOOL_RE.exec(content)) !== null) {
    calls.push({ name: m[1], arguments: m[2] })
  }
  return calls
}

// Remove qualquer tag <function...> do texto, pra nunca chegar ao paciente.
function limparTags(content) {
  if (!content) return content
  return content
    .replace(/<function=[a-zA-Z_]+>\s*\{[\s\S]*?\}\s*(?:<\/function>)?/g, '')
    .replace(/<\/?function[^>]*>/g, '')
    .trim()
}

// Executa de fato a ferramenta pedida pela IA.
async function executarFerramenta(nome, args, phone) {
  if (nome === 'verificar_horarios') {
    const date = parseISODate(args.data)
    const slots = await calendar.getAvailableSlots(date)
    if (!slots.length) return { horarios_livres: [], aviso: 'Nenhum horário livre nessa data.' }
    return { data: args.data, horarios_livres: slots.map((s) => s.label) }
  }

  if (nome === 'agendar_consulta') {
    const date = parseISODate(args.data)
    const [hour, min] = String(args.hora).split(':').map(Number)
    const result = await calendar.createAppointment({
      date,
      hour,
      min,
      paciente: args.nome,
      servico: args.servico,
      telefone: phone,
    })
    // Persiste no banco (se configurado).
    await db.upsertPatient(phone, args.nome)
    await db.saveAppointment({
      phone,
      patient_name: args.nome,
      service: args.servico,
      start_time: result.startISO,
      end_time: result.endISO,
      calendar_event_id: result.eventId,
      status: 'confirmado',
    })
    return { sucesso: true, confirmacao: result.label }
  }

  return { erro: 'Ferramenta desconhecida.' }
}

function systemPrompt() {
  const hoje = calendar.todayInTz()
  const dow = new Date(Date.UTC(hoje.year, hoje.month - 1, hoje.day)).getUTCDay()
  const dataHoje = `${WEEKDAYS[dow]}, ${calendar.formatDateBR(hoje)}`

  return (
    `Você é ${clinic.atendente}, a recepcionista da clínica odontológica ${clinic.nome}. ` +
    `Você atende os pacientes pelo WhatsApp.\n\n` +
    `HOJE é ${dataHoje}.\n\n` +
    `## Sua personalidade\n` +
    `- Fale como uma brasileira de verdade: calorosa, simpática, próxima e natural.\n` +
    `- Mensagens curtas, como em conversa de WhatsApp. Pode usar emojis com moderação. 😊\n` +
    `- Nunca soe robótica nem formal demais. Nada de listas com números ou "menus".\n` +
    `- NUNCA diga que é uma IA, robô, modelo ou assistente virtual. Você é a ${clinic.atendente}, recepcionista.\n\n` +
    `## Seu único papel\n` +
    `Ajudar pacientes da ${clinic.nome}: tirar dúvidas e agendar consultas.\n` +
    `Se pedirem qualquer coisa fora disso (escrever código, fazer lição, falar de outros assuntos, ` +
    `dar opinião sobre temas aleatórios), RECUSE com gentileza e bom humor, sem sair do personagem. ` +
    `Ex: "Ai, dessas coisas eu não entendo nada 😅 mas se for sobre a clínica ou sua consulta, pode contar comigo!"\n\n` +
    `## Dados da clínica\n` +
    `- Endereço: ${clinic.endereco}\n` +
    `- Telefone: ${clinic.telefone}\n` +
    `- Horário: ${clinic.horarioTexto}\n` +
    `- Serviços: ${clinic.servicos.join(', ')}\n\n` +
    `## Como agendar (importante!)\n` +
    `1. Para agendar você precisa de: NOME do paciente, qual SERVIÇO, e o DIA + HORÁRIO desejados. ` +
    `Pergunte o que faltar, de forma natural e uma coisa de cada vez.\n` +
    `2. A clínica abre das ${config.openHour}h às ${config.closeHour}h, de segunda a sexta. Nunca agende fim de semana.\n` +
    `3. Converta o que o paciente falar ("amanhã", "sexta", "dia 10") para o formato AAAA-MM-DD usando a data de HOJE.\n` +
    `4. SEMPRE use a ferramenta verificar_horarios para checar os horários reais antes de oferecer ou confirmar. Nunca invente horários.\n` +
    `5. Só use agendar_consulta depois que o paciente confirmar o horário. Depois de agendar, confirme de forma calorosa.\n\n` +
    `Responda sempre em português do Brasil.`
  )
}

// Conversa principal: recebe a mensagem do paciente e devolve a resposta da IA.
async function conversar(phone, texto) {
  if (!client) return null

  const history = await db.getRecentMessages(phone, 10)
  const messages = [
    { role: 'system', content: systemPrompt() },
    ...history,
    { role: 'user', content: texto },
  ]

  let respostaFinal = null
  // Loop "agêntico": a IA pode chamar ferramentas algumas vezes antes de responder.
  for (let i = 0; i < 5; i++) {
    let res
    try {
      res = await client.chat.completions.create({
        model: MODEL,
        temperature: 0.6,
        max_tokens: 500,
        messages,
        tools,
        tool_choice: 'auto',
      })
    } catch (err) {
      console.error(`Erro na LLM (${PROVIDER}/${MODEL}):`, err.message)
      return null
    }

    const msg = res.choices[0].message

    // Caminho ideal: chamadas de função estruturadas (API).
    if (msg.tool_calls && msg.tool_calls.length) {
      messages.push(msg)
      for (const tc of msg.tool_calls) {
        let saida
        try {
          const args = JSON.parse(tc.function.arguments || '{}')
          console.log(`🔧 IA chamou ${tc.function.name}(${tc.function.arguments})`)
          saida = await executarFerramenta(tc.function.name, args, phone)
        } catch (err) {
          console.error('Erro na ferramenta:', err.message)
          saida = { erro: 'Não consegui executar essa ação agora.' }
        }
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(saida) })
      }
      continue // volta pro modelo com os resultados das ferramentas
    }

    // Fallback: o modelo emitiu a chamada como TEXTO (<function=...>).
    const textCalls = parseTextToolCalls(msg.content)
    if (textCalls.length) {
      const resultados = []
      for (const c of textCalls) {
        let saida
        try {
          const args = JSON.parse(c.arguments || '{}')
          console.log(`🔧 IA chamou ${c.name}(${c.arguments}) [via texto]`)
          saida = await executarFerramenta(c.name, args, phone)
        } catch (err) {
          console.error('Erro na ferramenta:', err.message)
          saida = { erro: 'Não consegui executar essa ação agora.' }
        }
        resultados.push({ ferramenta: c.name, resultado: saida })
      }
      // Empurra o "raciocínio" limpo e o resultado, pedindo resposta natural.
      messages.push({ role: 'assistant', content: limparTags(msg.content) || '(consultando...)' })
      messages.push({
        role: 'user',
        content:
          `[SISTEMA] Resultado das ferramentas: ${JSON.stringify(resultados)}. ` +
          `Agora responda ao paciente de forma natural e calorosa, em primeira pessoa, ` +
          `SEM mostrar esse JSON e SEM nenhuma tag <function>.`,
      })
      continue
    }

    respostaFinal = limparTags(msg.content)
    break
  }

  // Salva a conversa no banco (memória pra próxima mensagem).
  if (respostaFinal) {
    await db.saveMessage(phone, 'user', texto)
    await db.saveMessage(phone, 'assistant', respostaFinal)
  }

  return respostaFinal
}

module.exports = { isEnabled, conversar, info }
