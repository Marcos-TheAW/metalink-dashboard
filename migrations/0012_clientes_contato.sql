-- Dados de contato/faturamento do cliente. Todos opcionais (nenhum NOT NULL, nenhum
-- DEFAULT): os clientes ja cadastrados ficam com NULL e vao sendo preenchidos a mao
-- quando conveniente, e o cadastro de um cliente novo continua exigindo so o nome.
-- Servem para sugerir automaticamente os campos da Criacao de Invoice para Clientes
-- Gringos (/faturas/gringos) — cnpj_cpf alimenta o "VAT ID" da invoice; o nome do campo
-- difere de proposito, porque no cadastro brasileiro o documento e CNPJ/CPF.
ALTER TABLE clientes ADD COLUMN cnpj_cpf TEXT;
ALTER TABLE clientes ADD COLUMN telefone_whatsapp TEXT;
ALTER TABLE clientes ADD COLUMN endereco TEXT;
ALTER TABLE clientes ADD COLUMN email TEXT;

-- v_clientes_status lista as colunas de `clientes` explicitamente (nao `c.*`), entao
-- precisa ser recriada para expor as quatro novas — a tela /clientes le a view, nao a
-- tabela, e precisa dos valores atuais para preencher o popover de edicao de cada linha.
-- Recriada identica a 0002_views.sql fora das 4 colunas adicionadas. v_kpis_gerais
-- referencia esta view por nome e e resolvida a cada consulta, entao o DROP/CREATE nao
-- exige recriar aquela tambem.
DROP VIEW v_clientes_status;
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
  c.cnpj_cpf,
  c.telefone_whatsapp,
  c.endereco,
  c.email,
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
