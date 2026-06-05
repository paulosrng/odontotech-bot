-- ============================================================
-- Schema do banco da OdontoTech (rodar no SQL Editor do Supabase)
-- Painel Supabase → SQL Editor → cole tudo isto → "Run"
-- ============================================================

-- Pacientes (um por número de WhatsApp)
create table if not exists patients (
  id          bigint generated always as identity primary key,
  phone       text unique not null,
  name        text,
  created_at  timestamptz default now()
);

-- Agendamentos feitos pelo bot
create table if not exists appointments (
  id                bigint generated always as identity primary key,
  phone             text not null,
  patient_name      text,
  service           text,
  start_time        timestamptz not null,
  end_time          timestamptz,
  calendar_event_id text,
  status            text default 'confirmado',
  created_at        timestamptz default now()
);

-- Histórico de conversa (memória da IA para soar natural)
create table if not exists messages (
  id          bigint generated always as identity primary key,
  phone       text not null,
  role        text not null,            -- 'user' ou 'assistant'
  content     text,
  created_at  timestamptz default now()
);

create index if not exists idx_messages_phone on messages (phone, created_at);
create index if not exists idx_appointments_phone on appointments (phone, created_at);
