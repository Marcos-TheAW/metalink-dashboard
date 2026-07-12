-- View de apoio ao card "Execução de Vendas" do dashboard.
-- "Última Semana" é sempre a última semana FECHADA (segunda a domingo anterior
-- à segunda-feira da semana corrente) — nunca a semana em andamento.
-- Recalculada a cada consulta a partir de date('now'); nada aqui é armazenado.

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
