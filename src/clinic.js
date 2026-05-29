// Informações e configurações da clínica.
// Edite aqui os dados reais da OdontoTech.

require('dotenv').config()

const clinic = {
  nome: 'OdontoTech',
  endereco: 'Rua Exemplo, 123 - Centro, Sua Cidade/UF',
  telefone: '(00) 0000-0000',
  horarioTexto: 'Segunda a sexta, das 9h às 18h',
  servicos: [
    'Limpeza / Profilaxia',
    'Avaliação / Consulta inicial',
    'Restauração (obturação)',
    'Clareamento dental',
    'Tratamento de canal',
    'Ortodontia (aparelho)',
  ],
}

const config = {
  timezone: process.env.TIMEZONE || 'America/Sao_Paulo',
  openHour: Number(process.env.CLINIC_OPEN_HOUR || 9),
  closeHour: Number(process.env.CLINIC_CLOSE_HOUR || 18),
  durationMin: Number(process.env.APPOINTMENT_DURATION_MIN || 30),
}

module.exports = { clinic, config }
