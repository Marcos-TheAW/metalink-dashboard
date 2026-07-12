-- Schema inicial do metalink-dashboard
-- Substitui a planilha "Controle Operacional — Vendas e Relacionamento.xlsx"

CREATE TABLE usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  papel TEXT NOT NULL CHECK (papel IN ('admin', 'colaborador')),
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT UNIQUE NOT NULL,
  observacao TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE pedidos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  canal TEXT NOT NULL
    CHECK (canal IN ('presswhizz','white_press','cliente_direto_br','cliente_direto_intl')),
  qtd_links INTEGER NOT NULL DEFAULT 1,
  valor_centavos INTEGER NOT NULL,
  data_pedido TEXT NOT NULL,
  prazo_entrega TEXT,
  status TEXT NOT NULL DEFAULT 'aguardando_producao'
    CHECK (status IN ('aguardando_producao','em_producao','aguardando_publicacao','entregue','pagamento_realizado','com_problema')),
  link_detalhe TEXT,
  responsavel_id INTEGER REFERENCES usuarios(id),
  criado_por INTEGER NOT NULL REFERENCES usuarios(id),
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE acoes_comerciais (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  canal TEXT NOT NULL CHECK (canal IN ('whatsapp','email','facebook')),
  tipo TEXT NOT NULL
    CHECK (tipo IN ('follow_up_risco','proposta_nova','upsell_cross_sell','prospeccao_novo_cliente','reativacao_cliente_perdido')),
  resultado TEXT NOT NULL
    CHECK (resultado IN ('sem_resposta','em_andamento','converteu_em_venda','nao_teve_interesse','completo')),
  observacoes TEXT,
  data_acao TEXT NOT NULL,
  responsavel_id INTEGER REFERENCES usuarios(id),
  criado_por INTEGER NOT NULL REFERENCES usuarios(id),
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE historico_alteracoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tabela TEXT NOT NULL,
  registro_id INTEGER NOT NULL,
  usuario_id INTEGER REFERENCES usuarios(id),
  campo TEXT,
  valor_anterior TEXT,
  valor_novo TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_pedidos_cliente_id ON pedidos(cliente_id);
CREATE INDEX idx_pedidos_status ON pedidos(status);
CREATE INDEX idx_pedidos_data_pedido ON pedidos(data_pedido);
CREATE INDEX idx_acoes_cliente_id ON acoes_comerciais(cliente_id);
CREATE INDEX idx_acoes_data_acao ON acoes_comerciais(data_acao);
CREATE INDEX idx_historico_tabela_registro ON historico_alteracoes(tabela, registro_id);
