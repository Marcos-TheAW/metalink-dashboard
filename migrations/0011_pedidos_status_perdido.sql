-- Adiciona "Perdido" como novo Status do Pedido. SQLite não permite alterar um
-- CHECK existente diretamente, então a tabela é recriada preservando dados, ids
-- e índices — mesma técnica de migrations/0006_acoes_tipo_followup.sql.
--
-- v_clientes_status, v_kpis_gerais e v_execucao_vendas leem de pedidos, então
-- precisam ser derrubadas antes da troca de tabela e recriadas depois (mesmo
-- SQL de migrations/0002_views.sql e migrations/0003_execucao_vendas.sql).

PRAGMA foreign_keys=OFF;

DROP VIEW v_execucao_vendas;
DROP VIEW v_kpis_gerais;
DROP VIEW v_clientes_status;

CREATE TABLE pedidos_novo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  canal TEXT NOT NULL
    CHECK (canal IN ('presswhizz','white_press','cliente_direto_br','cliente_direto_intl')),
  qtd_links INTEGER NOT NULL DEFAULT 1,
  valor_centavos INTEGER NOT NULL,
  data_pedido TEXT NOT NULL,
  prazo_entrega TEXT,
  status TEXT NOT NULL DEFAULT 'aguardando_producao'
    CHECK (status IN ('aguardando_producao','em_producao','aguardando_publicacao','entregue','pagamento_realizado','com_problema','perdido')),
  link_detalhe TEXT,
  responsavel_id INTEGER REFERENCES usuarios(id),
  criado_por INTEGER NOT NULL REFERENCES usuarios(id),
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
  observacao TEXT
);

INSERT INTO pedidos_novo SELECT * FROM pedidos;

DROP TABLE pedidos;
ALTER TABLE pedidos_novo RENAME TO pedidos;

CREATE INDEX idx_pedidos_cliente_id ON pedidos(cliente_id);
CREATE INDEX idx_pedidos_status ON pedidos(status);
CREATE INDEX idx_pedidos_data_pedido ON pedidos(data_pedido);

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

CREATE VIEW v_execucao_vendas AS
WITH datas AS (
  SELECT
    date('now', '-' || ((CAST(strftime('%w', 'now') AS INTEGER) + 6) % 7) || ' days') AS semana_atual_inicio,
    (SELECT MIN(data_pedido) FROM pedidos) AS primeira_data
),
janelas AS (
  SELECT
    semana_atual_inicio,
    date(semana_atual_inicio, '-7 days') AS ultima_semana_inicio,
    date(semana_atual_inicio, '-1 days') AS ultima_semana_fim,
    CASE WHEN primeira_data IS NULL THEN NULL
         ELSE date(primeira_data, '-' || ((CAST(strftime('%w', primeira_data) AS INTEGER) + 6) % 7) || ' days')
    END AS primeira_semana_inicio
  FROM datas
),
totais AS (
  SELECT
    COUNT(*) AS pedidos,
    COALESCE(SUM(qtd_links), 0) AS links,
    COALESCE(SUM(valor_centavos), 0) AS receita_centavos
  FROM pedidos
),
semana_passada AS (
  SELECT
    COUNT(*) AS pedidos,
    COALESCE(SUM(qtd_links), 0) AS links,
    COALESCE(SUM(valor_centavos), 0) AS receita_centavos
  FROM pedidos, janelas
  WHERE data_pedido BETWEEN janelas.ultima_semana_inicio AND janelas.ultima_semana_fim
)
SELECT
  totais.pedidos AS total_pedidos,
  totais.links AS total_links,
  totais.receita_centavos AS total_receita_centavos,
  semana_passada.pedidos AS ultima_semana_pedidos,
  semana_passada.links AS ultima_semana_links,
  semana_passada.receita_centavos AS ultima_semana_receita_centavos,
  janelas.ultima_semana_inicio,
  janelas.ultima_semana_fim,
  CASE
    WHEN janelas.primeira_semana_inicio IS NULL THEN 0
    ELSE CAST((julianday(janelas.semana_atual_inicio) - julianday(janelas.primeira_semana_inicio)) / 7 AS INTEGER) + 1
  END AS semanas_decorridas
FROM totais, janelas, semana_passada;
