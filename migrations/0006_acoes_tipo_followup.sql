-- Adiciona "Follow-up" (genérico) como novo Tipo de Ação, além do já existente
-- "Follow-up Cliente em Risco". SQLite não permite alterar um CHECK existente
-- diretamente, então a tabela é recriada preservando dados, ids e índices.
--
-- v_clientes_status e v_kpis_gerais leem de acoes_comerciais, então precisam
-- ser derrubadas antes da troca de tabela e recriadas depois (mesmo SQL do
-- migrations/0002_views.sql), senão o DROP TABLE falha por dependência.

PRAGMA foreign_keys=OFF;

DROP VIEW v_kpis_gerais;
DROP VIEW v_clientes_status;

CREATE TABLE acoes_comerciais_novo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  canal TEXT NOT NULL CHECK (canal IN ('whatsapp','email','facebook')),
  tipo TEXT NOT NULL
    CHECK (tipo IN ('follow_up','follow_up_risco','proposta_nova','upsell_cross_sell','prospeccao_novo_cliente','reativacao_cliente_perdido')),
  resultado TEXT NOT NULL
    CHECK (resultado IN ('sem_resposta','em_andamento','converteu_em_venda','nao_teve_interesse','completo')),
  observacoes TEXT,
  data_acao TEXT NOT NULL,
  responsavel_id INTEGER REFERENCES usuarios(id),
  criado_por INTEGER NOT NULL REFERENCES usuarios(id),
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO acoes_comerciais_novo SELECT * FROM acoes_comerciais;

DROP TABLE acoes_comerciais;
ALTER TABLE acoes_comerciais_novo RENAME TO acoes_comerciais;

CREATE INDEX idx_acoes_cliente_id ON acoes_comerciais(cliente_id);
CREATE INDEX idx_acoes_data_acao ON acoes_comerciais(data_acao);

PRAGMA foreign_keys=ON;

CREATE VIEW v_clientes_status AS
WITH pedido_stats AS (
  SELECT
    cliente_id,
    MAX(data_pedido) AS ultimo_pedido,
    COUNT(*) AS total_pedidos,
    COALESCE(SUM(valor_centavos), 0) AS receita_total_centavos
  FROM pedidos
  GROUP BY cliente_id
),
acao_stats AS (
  SELECT
    cliente_id,
    MAX(data_acao) AS ultimo_contato
  FROM acoes_comerciais
  GROUP BY cliente_id
)
SELECT
  c.id,
  c.nome,
  c.observacao,
  ps.ultimo_pedido,
  CASE WHEN ps.ultimo_pedido IS NULL THEN NULL
       ELSE CAST(julianday('now') - julianday(ps.ultimo_pedido) AS INTEGER)
  END AS dias_sem_pedido,
  acs.ultimo_contato,
  CASE WHEN acs.ultimo_contato IS NULL THEN NULL
       ELSE CAST(julianday('now') - julianday(acs.ultimo_contato) AS INTEGER)
  END AS dias_sem_contato,
  COALESCE(ps.total_pedidos, 0) AS total_pedidos,
  COALESCE(ps.receita_total_centavos, 0) AS receita_total_centavos,
  CASE
    WHEN ps.ultimo_pedido IS NULL THEN 'nunca_comprou'
    WHEN julianday('now') - julianday(ps.ultimo_pedido) <= 30 THEN 'ativo'
    WHEN julianday('now') - julianday(ps.ultimo_pedido) <= 60 THEN 'em_risco'
    ELSE 'perdido'
  END AS status_relacionamento,
  CASE WHEN COALESCE(ps.receita_total_centavos, 0) > 300000 THEN 1 ELSE 0 END AS key_account
FROM clientes c
LEFT JOIN pedido_stats ps ON ps.cliente_id = c.id
LEFT JOIN acao_stats acs ON acs.cliente_id = c.id;

CREATE VIEW v_kpis_gerais AS
SELECT
  (SELECT COUNT(*) FROM pedidos) AS total_pedidos,
  (SELECT COALESCE(SUM(valor_centavos), 0) FROM pedidos) AS receita_total_centavos,
  (SELECT CASE WHEN SUM(CASE WHEN valor_centavos > 0 THEN 1 ELSE 0 END) = 0 THEN 0
        ELSE CAST(SUM(CASE WHEN valor_centavos > 0 THEN valor_centavos ELSE 0 END) AS REAL)
             / SUM(CASE WHEN valor_centavos > 0 THEN 1 ELSE 0 END)
   END FROM pedidos) AS ticket_medio_centavos,
  (SELECT COUNT(*) FROM acoes_comerciais) AS total_acoes,
  (SELECT COALESCE(SUM(CASE WHEN resultado = 'converteu_em_venda' THEN 1 ELSE 0 END), 0) FROM acoes_comerciais) AS acoes_convertidas,
  (SELECT CASE WHEN COUNT(*) = 0 THEN 0
        ELSE CAST(SUM(CASE WHEN resultado = 'converteu_em_venda' THEN 1 ELSE 0 END) AS REAL) / COUNT(*)
   END FROM acoes_comerciais) AS taxa_conversao,
  (SELECT COALESCE(SUM(p.valor_centavos), 0)
     FROM pedidos p
     JOIN v_clientes_status cs ON cs.id = p.cliente_id
    WHERE cs.status_relacionamento IN ('em_risco', 'perdido')
  ) AS receita_em_risco_centavos;
