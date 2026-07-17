-- Prospecção de Sites: substitui a planilha "Controle de Novos Parceiros Contatados".
-- Fluxo separado de Pedidos/Ações Comerciais — aqui são sites que a agência tenta
-- fechar como fornecedores/parceiros, não clientes que já compram.

CREATE TABLE sites_prospectados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url_site TEXT NOT NULL,
  domain_rating INTEGER,
  trafego_estimado INTEGER,
  nicho TEXT,
  canal TEXT NOT NULL
    CHECK (canal IN ('whatsapp','email')),
  tipo_contato TEXT NOT NULL
    CHECK (tipo_contato IN ('whatsapp_business','email_comercial','email_pessoal','formulario')),
  status TEXT NOT NULL DEFAULT 'nao_contatado'
    CHECK (status IN ('nao_contatado','contatado_aguardando_resposta','em_negociacao','proposta_enviada','fechado','sem_interesse','sem_resposta_followup')),
  num_tentativas INTEGER NOT NULL DEFAULT 1,
  data_contato TEXT NOT NULL, -- sempre a segunda-feira da semana do contato
  link_email TEXT,
  valor_solicitado_white_centavos INTEGER,
  valor_solicitado_black_centavos INTEGER,
  valor_fechado_white_centavos INTEGER,
  valor_fechado_black_centavos INTEGER,
  valor_fechado_insercao_centavos INTEGER,
  aceita_insercao TEXT
    CHECK (aceita_insercao IN ('sim','nao','nao_perguntado')),
  aceita_pacote TEXT
    CHECK (aceita_pacote IN ('sim','nao','nao_perguntado')),
  administra_outros_sites TEXT
    CHECK (administra_outros_sites IN ('sim','nao','nao_perguntado')),
  outros_sites_urls TEXT,
  dentro_tabela_precos TEXT
    CHECK (dentro_tabela_precos IN ('sim','nao')),
  observacoes TEXT,
  responsavel_id INTEGER REFERENCES usuarios(id),
  criado_por INTEGER NOT NULL REFERENCES usuarios(id),
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_sites_prospectados_data_contato ON sites_prospectados(data_contato);
CREATE INDEX idx_sites_prospectados_status ON sites_prospectados(status);

-- Referência de negociação (SOP) — muda raramente, só admin edita.
CREATE TABLE tabela_precos_faixas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ordem INTEGER NOT NULL,
  dr_min INTEGER NOT NULL,
  dr_max INTEGER,              -- NULL = sem teto (ex: "80+")
  trafego_min INTEGER,
  trafego_max INTEGER,         -- NULL = sem teto (ex: "40.000+")
  valor_min_centavos INTEGER NOT NULL,
  valor_max_centavos INTEGER NOT NULL,
  observacao TEXT
);

CREATE TABLE tabela_precos_red_flags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ordem INTEGER NOT NULL,
  sinal_de_alerta TEXT NOT NULL,
  possivel_causa TEXT NOT NULL
);
