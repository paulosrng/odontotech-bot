// Cérebro do bot: conversa 100% por IA (Qwen3 local via Ollama/vLLM) com persona humanizada.
// A IA conversa naturalmente e usa "function calling" para executar ações
// reais: consultar horários e agendar consultas (Google Calendar + SQLite).

const OpenAI = require('openai')
const { clinic, config } = require('./clinic')
const calendar = require('./googleCalendar')
const db = require('./db')

const BASE_URL = process.env.AI_BASE_URL || 'http://localhost:11434/v1'
const API_KEY = process.env.AI_API_KEY || 'ollama'
const MODEL = process.env.AI_MODEL_NAME || 'qwen3:0.6b'

const aiClient = new OpenAI({ baseURL: BASE_URL, apiKey: API_KEY })

function isEnabled() {
  return Boolean(BASE_URL && MODEL)
}

const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']

// ---------- Ferramentas que a IA pode chamar ----------
// Descrições curtas e diretas — essencial para modelos menores como o Qwen3-0.6B.

const tools = [
  {
    type: 'function',
    function: {
      name: 'verificar_horarios',
      description: 'Consulta horários livres reais da clínica em uma data. Use SEMPRE antes de oferecer ou confirmar qualquer horário. Nunca invente horários.',
      parameters: {
        type: 'object',
        properties: {
          data: { type: 'string', description: 'Data no formato AAAA-MM-DD' },
        },
        required: ['data'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'agendar_consulta',
      description: 'Cria a consulta na agenda. Use somente após ter: nome do paciente, serviço, data e horário confirmados pelo paciente.',
      parameters: {
        type: 'object',
        properties: {
          nome: { type: 'string', description: 'Nome completo do paciente' },
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

// Fallback: alguns modelos emitem a chamada de função como TEXTO,
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

// Remove tags de função e blocos de "thinking" do Qwen3 (<think>...</think>)
// para que nunca cheguem ao paciente.
function limparResposta(content) {
  if (!content) return content
  return content
    .replace(/<think>[\s\S]*?<\/think>/g, '')
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
    `/no_think\n` +
    `Você é ${clinic.atendente}, recepcionista humana da ${clinic.nome} no WhatsApp. HOJE: ${dataHoje}.\n\n` +

    `REGRAS:\n` +
    `- Respostas curtas, 1 a 2 frases, tom informal brasileiro. Emojis com moderação.\n` +
    `- Nunca diga que é IA. Recuse pedidos fora de odontologia com bom humor.\n` +
    `- NUNCA invente horários. Sempre chame verificar_horarios antes de citar qualquer horário.\n` +
    `- Só chame agendar_consulta após confirmar: nome, serviço, data e horário com o paciente.\n` +
    `- Pergunte dados faltantes um por vez.\n\n` +

    `CLÍNICA:\n` +
    `- Endereço: ${clinic.endereco}\n` +
    `- Horário: ${clinic.horarioTexto} (seg-sex). Nunca agende fim de semana.\n` +
    `- Serviços: ${clinic.servicos.join(', ')}\n\n` +

    `EXEMPLOS:\n` +
    `P: "Fazem clareamento?" → "Fazemos sim! 😊 Quer agendar uma avaliação?"\n` +
    `P: "Me dá um horário amanhã." → [chama verificar_horarios para amanhã]\n` +
    `P: "Escreve um código." → "Isso eu não sei não 😅 Posso te ajudar com consultas!"\n`
  )
}
// Conversa principal: recebe a mensagem do paciente e devolve a resposta da IA.
async function conversar(phone, texto) {
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
      res = await aiClient.chat.completions.create({
        model: MODEL,
        temperature: 0.5,   // Baixo para o modelo seguir instruções com mais precisão
        max_tokens: 350,    // Suficiente para 2-3 frases; reduz latência significativamente
        messages,
        tools,
        tool_choice: 'auto',
      })
    } catch (err) {
      console.error('Erro na IA local:', err.message)
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
      continue
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
      messages.push({ role: 'assistant', content: limparResposta(msg.content) || '(consultando...)' })
      messages.push({
        role: 'user',
        content:
          `[SISTEMA] Resultado das ferramentas: ${JSON.stringify(resultados)}. ` +
          `Agora responda ao paciente de forma natural e calorosa, em primeira pessoa, ` +
          `SEM mostrar esse JSON e SEM nenhuma tag <function>.`,
      })
      continue
    }

    respostaFinal = limparResposta(msg.content)
    break
  }

  // Salva a conversa no banco (memória pra próxima mensagem).
  if (respostaFinal) {
    await db.saveMessage(phone, 'user', texto)
    await db.saveMessage(phone, 'assistant', respostaFinal)
  }

  return respostaFinal
}

module.exports = { isEnabled, conversar }