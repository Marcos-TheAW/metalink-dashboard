-- Views de negócio para Prospecção de Sites. Nada aqui é armazenado; tudo é
-- recalculado a cada consulta a partir de sites_prospectados e de date('now').
-- Toda divisão é protegida (CASE WHEN denom <= 0 THEN NULL ELSE ... END) — nunca
-- erro/NaN; a camada de exibição trata NULL como "-" (centavosOuTraco/percentualOuTraco/numeroOuTraco).

-- ---------- Painel Semanal (uma linha por semana; data_contato já é a segunda) ----------

CREATE VIEW v_prospeccao_semanal AS
WITH base AS (
  SELECT
    data_contato AS semana,
    COUNT(*) AS total,
    SUM(CASE WHEN status = 'contatado_aguardando_resposta' THEN 1 ELSE 0 END) AS aguardando,
    SUM(CASE WHEN canal = 'whatsapp' THEN 1 ELSE 0 END) AS via_whatsapp,
    SUM(CASE WHEN canal = 'email' THEN 1 ELSE 0 END) AS via_email,
    SUM(CASE WHEN num_tentativas >= 2 THEN 1 ELSE 0 END) AS followups,
    SUM(CASE WHEN status = 'em_negociacao' THEN 1 ELSE 0 END) AS em_negociacao,
    SUM(CASE WHEN status = 'fechado' THEN 1 ELSE 0 END) AS fechados,
    SUM(CASE WHEN status = 'sem_interesse' THEN 1 ELSE 0 END) AS sem_interesse,
    AVG(CASE WHEN status = 'fechado' THEN valor_fechado_white_centavos END) AS valor_medio_white_centavos,
    AVG(CASE WHEN status = 'fechado' THEN valor_fechado_black_centavos END) AS valor_medio_black_centavos,
    AVG(CASE WHEN status = 'fechado' THEN valor_fechado_insercao_centavos END) AS valor_medio_insercao_centavos,
    SUM(CASE WHEN status = 'fechado' AND aceita_insercao = 'sim' THEN 1 ELSE 0 END) AS fechado_aceita_insercao,
    SUM(CASE WHEN status = 'fechado' AND administra_outros_sites = 'sim' THEN 1 ELSE 0 END) AS fechado_administra_outros,
    SUM(CASE WHEN status = 'fechado' AND dentro_tabela_precos = 'sim' THEN 1 ELSE 0 END) AS fechado_dentro_tabela,
    SUM(CASE WHEN status = 'fechado' AND aceita_pacote = 'sim' THEN 1 ELSE 0 END) AS fechado_pacote,
    SUM(CASE WHEN status = 'fechado' AND aceita_insercao IS NOT NULL AND aceita_insercao != 'nao_perguntado' THEN 1 ELSE 0 END) AS fechado_perguntou_insercao,
    SUM(CASE WHEN status = 'fechado' AND administra_outros_sites IS NOT NULL AND administra_outros_sites != 'nao_perguntado' THEN 1 ELSE 0 END) AS fechado_perguntou_outros,
    SUM(CASE WHEN outros_sites_urls IS NOT NULL AND outros_sites_urls != '' THEN 1 ELSE 0 END) AS novos_sites_derivados
  FROM sites_prospectados
  GROUP BY data_contato
)
SELECT
  semana,
  total,
  aguardando,
  (total - aguardando) AS respondentes,
  via_whatsapp,
  via_email,
  followups,
  fechados AS sites_fechados,
  novos_sites_derivados,
  CASE WHEN total = 0 THEN NULL ELSE CAST(total - aguardando AS REAL) / total END AS taxa_resposta,
  CASE WHEN (total - aguardando) <= 0 THEN NULL ELSE CAST(em_negociacao AS REAL) / (total - aguardando) END AS taxa_negociacao,
  CASE WHEN total = 0 THEN NULL ELSE CAST(fechados AS REAL) / total END AS taxa_fechamento_contatados,
  CASE WHEN (total - aguardando) <= 0 THEN NULL ELSE CAST(fechados AS REAL) / (total - aguardando) END AS taxa_fechamento_respondentes,
  CASE WHEN (total - aguardando) <= 0 THEN NULL ELSE CAST(sem_interesse AS REAL) / (total - aguardando) END AS taxa_recusa,
  valor_medio_white_centavos,
  valor_medio_black_centavos,
  valor_medio_insercao_centavos,
  CASE WHEN fechados = 0 THEN NULL ELSE CAST(fechado_aceita_insercao AS REAL) / fechados END AS pct_aceita_insercao,
  CASE WHEN fechados = 0 THEN NULL ELSE CAST(fechado_administra_outros AS REAL) / fechados END AS pct_administra_outros_sites,
  CASE WHEN fechados = 0 THEN NULL ELSE CAST(fechado_dentro_tabela AS REAL) / fechados END AS pct_dentro_tabela_precos,
  CASE WHEN fechados = 0 THEN NULL ELSE CAST(fechado_pacote AS REAL) / fechados END AS pct_pacote_fechado,
  CASE WHEN fechados = 0 THEN NULL ELSE CAST(fechado_perguntou_insercao AS REAL) / fechados END AS pct_perguntou_insercao,
  CASE WHEN fechados = 0 THEN NULL ELSE CAST(fechado_perguntou_outros AS REAL) / fechados END AS pct_perguntou_outros_dominios
FROM base;

-- ---------- Overview / Bloco 1 — Volume de Atividade ----------

CREATE VIEW v_prospeccao_overview_volume AS
WITH semana AS (
  SELECT date('now', '-' || ((CAST(strftime('%w', 'now') AS INTEGER) + 6) % 7) || ' days') AS semana_atual
),
semanas_distintas AS (
  SELECT COUNT(DISTINCT data_contato) AS n FROM sites_prospectados
),
totais AS (
  SELECT
    COUNT(*) AS sites_contatados,
    SUM(CASE WHEN canal = 'whatsapp' THEN 1 ELSE 0 END) AS via_whatsapp,
    SUM(CASE WHEN canal = 'email' THEN 1 ELSE 0 END) AS via_email,
    SUM(CASE WHEN num_tentativas >= 2 THEN 1 ELSE 0 END) AS followups
  FROM sites_prospectados
),
semana_atual AS (
  SELECT
    COUNT(*) AS sites_contatados,
    SUM(CASE WHEN canal = 'whatsapp' THEN 1 ELSE 0 END) AS via_whatsapp,
    SUM(CASE WHEN canal = 'email' THEN 1 ELSE 0 END) AS via_email,
    SUM(CASE WHEN num_tentativas >= 2 THEN 1 ELSE 0 END) AS followups
  FROM sites_prospectados, semana
  WHERE data_contato = semana.semana_atual
)
SELECT
  totais.sites_contatados AS sites_contatados_total,
  CASE WHEN semanas_distintas.n = 0 THEN NULL ELSE CAST(totais.sites_contatados AS REAL) / semanas_distintas.n END AS sites_contatados_media_semana,
  COALESCE(semana_atual.sites_contatados, 0) AS sites_contatados_semana_atual,
  totais.via_whatsapp AS contatos_whatsapp_total,
  CASE WHEN semanas_distintas.n = 0 THEN NULL ELSE CAST(totais.via_whatsapp AS REAL) / semanas_distintas.n END AS contatos_whatsapp_media_semana,
  COALESCE(semana_atual.via_whatsapp, 0) AS contatos_whatsapp_semana_atual,
  totais.via_email AS contatos_email_total,
  CASE WHEN semanas_distintas.n = 0 THEN NULL ELSE CAST(totais.via_email AS REAL) / semanas_distintas.n END AS contatos_email_media_semana,
  COALESCE(semana_atual.via_email, 0) AS contatos_email_semana_atual,
  totais.followups AS followups_total,
  CASE WHEN semanas_distintas.n = 0 THEN NULL ELSE CAST(totais.followups AS REAL) / semanas_distintas.n END AS followups_media_semana,
  COALESCE(semana_atual.followups, 0) AS followups_semana_atual
FROM totais, semanas_distintas, semana
LEFT JOIN semana_atual ON 1 = 1;

-- ---------- Overview / Bloco 2 — Conversão ----------
-- "Total Acumulado" mostra percentual real (pooled numerador/denominador), não a
-- contagem bruta "coluna gêmea" que a planilha original tinha por erro de copiar/colar.

CREATE VIEW v_prospeccao_overview_conversao AS
WITH semana AS (
  SELECT date('now', '-' || ((CAST(strftime('%w', 'now') AS INTEGER) + 6) % 7) || ' days') AS semana_atual
),
pooled AS (
  SELECT
    COUNT(*) AS total,
    SUM(CASE WHEN status = 'contatado_aguardando_resposta' THEN 1 ELSE 0 END) AS aguardando,
    SUM(CASE WHEN status = 'em_negociacao' THEN 1 ELSE 0 END) AS em_negociacao,
    SUM(CASE WHEN status = 'fechado' THEN 1 ELSE 0 END) AS fechados,
    SUM(CASE WHEN status = 'sem_interesse' THEN 1 ELSE 0 END) AS sem_interesse
  FROM sites_prospectados
),
medias AS (
  SELECT
    AVG(taxa_resposta) AS taxa_resposta_media,
    AVG(taxa_negociacao) AS taxa_negociacao_media,
    AVG(taxa_fechamento_contatados) AS taxa_fechamento_contatados_media,
    AVG(taxa_fechamento_respondentes) AS taxa_fechamento_respondentes_media,
    AVG(taxa_recusa) AS taxa_recusa_media
  FROM v_prospeccao_semanal
),
atual AS (
  SELECT
    v.taxa_resposta AS taxa_resposta_atual,
    v.taxa_negociacao AS taxa_negociacao_atual,
    v.taxa_fechamento_contatados AS taxa_fechamento_contatados_atual,
    v.taxa_fechamento_respondentes AS taxa_fechamento_respondentes_atual,
    v.taxa_recusa AS taxa_recusa_atual
  FROM v_prospeccao_semanal v, semana
  WHERE v.semana = semana.semana_atual
)
SELECT
  CASE WHEN pooled.total = 0 THEN NULL ELSE CAST(pooled.total - pooled.aguardando AS REAL) / pooled.total END AS taxa_resposta_total,
  medias.taxa_resposta_media AS taxa_resposta_media_semana,
  atual.taxa_resposta_atual AS taxa_resposta_semana_atual,
  CASE WHEN (pooled.total - pooled.aguardando) <= 0 THEN NULL ELSE CAST(pooled.em_negociacao AS REAL) / (pooled.total - pooled.aguardando) END AS taxa_negociacao_total,
  medias.taxa_negociacao_media AS taxa_negociacao_media_semana,
  atual.taxa_negociacao_atual AS taxa_negociacao_semana_atual,
  CASE WHEN pooled.total = 0 THEN NULL ELSE CAST(pooled.fechados AS REAL) / pooled.total END AS taxa_fechamento_contatados_total,
  medias.taxa_fechamento_contatados_media AS taxa_fechamento_contatados_media_semana,
  atual.taxa_fechamento_contatados_atual AS taxa_fechamento_contatados_semana_atual,
  CASE WHEN (pooled.total - pooled.aguardando) <= 0 THEN NULL ELSE CAST(pooled.fechados AS REAL) / (pooled.total - pooled.aguardando) END AS taxa_fechamento_respondentes_total,
  medias.taxa_fechamento_respondentes_media AS taxa_fechamento_respondentes_media_semana,
  atual.taxa_fechamento_respondentes_atual AS taxa_fechamento_respondentes_semana_atual,
  CASE WHEN (pooled.total - pooled.aguardando) <= 0 THEN NULL ELSE CAST(pooled.sem_interesse AS REAL) / (pooled.total - pooled.aguardando) END AS taxa_recusa_total,
  medias.taxa_recusa_media AS taxa_recusa_media_semana,
  atual.taxa_recusa_atual AS taxa_recusa_semana_atual
FROM pooled, medias, semana
LEFT JOIN atual ON 1 = 1;

-- ---------- Overview / Bloco 3 — Resultado Comercial ----------

CREATE VIEW v_prospeccao_overview_comercial AS
WITH semana AS (
  SELECT
    date('now', '-' || ((CAST(strftime('%w', 'now') AS INTEGER) + 6) % 7) || ' days') AS semana_atual,
    date('now', '-' || ((CAST(strftime('%w', 'now') AS INTEGER) + 6) % 7) || ' days', '-7 days') AS semana_passada
),
janela AS (
  SELECT 'geral' AS janela, NULL AS de
  UNION ALL
  SELECT 'ultima', semana_passada FROM semana
  UNION ALL
  SELECT 'atual', semana_atual FROM semana
),
agregado AS (
  SELECT
    j.janela,
    SUM(CASE WHEN s.status = 'fechado' THEN 1 ELSE 0 END) AS sites_fechados,
    AVG(CASE WHEN s.status = 'fechado' THEN s.valor_fechado_white_centavos END) AS valor_medio_white,
    AVG(CASE WHEN s.status = 'fechado' THEN s.valor_fechado_black_centavos END) AS valor_medio_black,
    AVG(CASE WHEN s.status = 'fechado' THEN s.valor_fechado_insercao_centavos END) AS valor_medio_insercao,
    SUM(CASE WHEN s.status = 'fechado' AND s.aceita_insercao = 'sim' THEN 1 ELSE 0 END) AS fechado_aceita_insercao,
    SUM(CASE WHEN s.status = 'fechado' AND s.administra_outros_sites = 'sim' THEN 1 ELSE 0 END) AS fechado_administra_outros,
    SUM(CASE WHEN s.status = 'fechado' THEN 1 ELSE 0 END) AS fechado_total,
    SUM(CASE WHEN s.outros_sites_urls IS NOT NULL AND s.outros_sites_urls != '' THEN 1 ELSE 0 END) AS novos_sites_derivados
  FROM janela j
  LEFT JOIN sites_prospectados s ON j.janela = 'geral' OR s.data_contato = j.de
  GROUP BY j.janela
)
SELECT
  MAX(CASE WHEN janela = 'geral' THEN sites_fechados END) AS sites_fechados_geral,
  COALESCE(MAX(CASE WHEN janela = 'ultima' THEN sites_fechados END), 0) AS sites_fechados_ultima_semana,
  COALESCE(MAX(CASE WHEN janela = 'atual' THEN sites_fechados END), 0) AS sites_fechados_semana_atual,
  MAX(CASE WHEN janela = 'geral' THEN valor_medio_white END) AS valor_medio_white_geral,
  MAX(CASE WHEN janela = 'ultima' THEN valor_medio_white END) AS valor_medio_white_ultima_semana,
  MAX(CASE WHEN janela = 'atual' THEN valor_medio_white END) AS valor_medio_white_semana_atual,
  MAX(CASE WHEN janela = 'geral' THEN valor_medio_black END) AS valor_medio_black_geral,
  MAX(CASE WHEN janela = 'ultima' THEN valor_medio_black END) AS valor_medio_black_ultima_semana,
  MAX(CASE WHEN janela = 'atual' THEN valor_medio_black END) AS valor_medio_black_semana_atual,
  MAX(CASE WHEN janela = 'geral' THEN valor_medio_insercao END) AS valor_medio_insercao_geral,
  MAX(CASE WHEN janela = 'ultima' THEN valor_medio_insercao END) AS valor_medio_insercao_ultima_semana,
  MAX(CASE WHEN janela = 'atual' THEN valor_medio_insercao END) AS valor_medio_insercao_semana_atual,
  CASE WHEN MAX(CASE WHEN janela = 'geral' THEN fechado_total END) = 0 THEN NULL
       ELSE CAST(MAX(CASE WHEN janela = 'geral' THEN fechado_aceita_insercao END) AS REAL) / MAX(CASE WHEN janela = 'geral' THEN fechado_total END) END AS pct_aceita_insercao_geral,
  CASE WHEN COALESCE(MAX(CASE WHEN janela = 'ultima' THEN fechado_total END), 0) = 0 THEN NULL
       ELSE CAST(MAX(CASE WHEN janela = 'ultima' THEN fechado_aceita_insercao END) AS REAL) / MAX(CASE WHEN janela = 'ultima' THEN fechado_total END) END AS pct_aceita_insercao_ultima_semana,
  CASE WHEN COALESCE(MAX(CASE WHEN janela = 'atual' THEN fechado_total END), 0) = 0 THEN NULL
       ELSE CAST(MAX(CASE WHEN janela = 'atual' THEN fechado_aceita_insercao END) AS REAL) / MAX(CASE WHEN janela = 'atual' THEN fechado_total END) END AS pct_aceita_insercao_semana_atual,
  CASE WHEN MAX(CASE WHEN janela = 'geral' THEN fechado_total END) = 0 THEN NULL
       ELSE CAST(MAX(CASE WHEN janela = 'geral' THEN fechado_administra_outros END) AS REAL) / MAX(CASE WHEN janela = 'geral' THEN fechado_total END) END AS pct_administra_outros_geral,
  CASE WHEN COALESCE(MAX(CASE WHEN janela = 'ultima' THEN fechado_total END), 0) = 0 THEN NULL
       ELSE CAST(MAX(CASE WHEN janela = 'ultima' THEN fechado_administra_outros END) AS REAL) / MAX(CASE WHEN janela = 'ultima' THEN fechado_total END) END AS pct_administra_outros_ultima_semana,
  CASE WHEN COALESCE(MAX(CASE WHEN janela = 'atual' THEN fechado_total END), 0) = 0 THEN NULL
       ELSE CAST(MAX(CASE WHEN janela = 'atual' THEN fechado_administra_outros END) AS REAL) / MAX(CASE WHEN janela = 'atual' THEN fechado_total END) END AS pct_administra_outros_semana_atual,
  COALESCE(MAX(CASE WHEN janela = 'geral' THEN novos_sites_derivados END), 0) AS novos_sites_derivados_geral,
  COALESCE(MAX(CASE WHEN janela = 'ultima' THEN novos_sites_derivados END), 0) AS novos_sites_derivados_ultima_semana,
  COALESCE(MAX(CASE WHEN janela = 'atual' THEN novos_sites_derivados END), 0) AS novos_sites_derivados_semana_atual
FROM agregado;

-- ---------- Overview / Bloco 4 — Qualidade da Negociação ----------
-- % Perguntou sobre Inserção/Outros Domínios usa a MESMA fórmula do Painel Semanal
-- (COUNT(fechado AND <> 'nao_perguntado') / COUNT(fechado)), não a fórmula divergente
-- que a planilha original usava só na aba Overview — resolve a inconsistência entre
-- as duas abas, como pedido.

CREATE VIEW v_prospeccao_overview_qualidade AS
WITH semana AS (
  SELECT date('now', '-' || ((CAST(strftime('%w', 'now') AS INTEGER) + 6) % 7) || ' days') AS semana_atual
),
pooled AS (
  SELECT
    SUM(CASE WHEN status = 'fechado' THEN 1 ELSE 0 END) AS fechados,
    SUM(CASE WHEN status = 'fechado' AND dentro_tabela_precos = 'sim' THEN 1 ELSE 0 END) AS dentro_tabela,
    SUM(CASE WHEN status = 'fechado' AND aceita_pacote = 'sim' THEN 1 ELSE 0 END) AS pacote,
    SUM(CASE WHEN status = 'fechado' AND aceita_insercao IS NOT NULL AND aceita_insercao != 'nao_perguntado' THEN 1 ELSE 0 END) AS perguntou_insercao,
    SUM(CASE WHEN status = 'fechado' AND administra_outros_sites IS NOT NULL AND administra_outros_sites != 'nao_perguntado' THEN 1 ELSE 0 END) AS perguntou_outros
  FROM sites_prospectados
),
medias AS (
  SELECT
    AVG(pct_dentro_tabela_precos) AS dentro_tabela_media,
    AVG(pct_pacote_fechado) AS pacote_media,
    AVG(pct_perguntou_insercao) AS perguntou_insercao_media,
    AVG(pct_perguntou_outros_dominios) AS perguntou_outros_media
  FROM v_prospeccao_semanal
),
atual AS (
  SELECT
    v.pct_dentro_tabela_precos AS dentro_tabela_atual,
    v.pct_pacote_fechado AS pacote_atual,
    v.pct_perguntou_insercao AS perguntou_insercao_atual,
    v.pct_perguntou_outros_dominios AS perguntou_outros_atual
  FROM v_prospeccao_semanal v, semana
  WHERE v.semana = semana.semana_atual
)
SELECT
  CASE WHEN pooled.fechados = 0 THEN NULL ELSE CAST(pooled.dentro_tabela AS REAL) / pooled.fechados END AS pct_dentro_tabela_total,
  medias.dentro_tabela_media AS pct_dentro_tabela_media_semana,
  atual.dentro_tabela_atual AS pct_dentro_tabela_semana_atual,
  CASE WHEN pooled.fechados = 0 THEN NULL ELSE CAST(pooled.pacote AS REAL) / pooled.fechados END AS pct_pacote_fechado_total,
  medias.pacote_media AS pct_pacote_fechado_media_semana,
  atual.pacote_atual AS pct_pacote_fechado_semana_atual,
  CASE WHEN pooled.fechados = 0 THEN NULL ELSE CAST(pooled.perguntou_insercao AS REAL) / pooled.fechados END AS pct_perguntou_insercao_total,
  medias.perguntou_insercao_media AS pct_perguntou_insercao_media_semana,
  atual.perguntou_insercao_atual AS pct_perguntou_insercao_semana_atual,
  CASE WHEN pooled.fechados = 0 THEN NULL ELSE CAST(pooled.perguntou_outros AS REAL) / pooled.fechados END AS pct_perguntou_outros_total,
  medias.perguntou_outros_media AS pct_perguntou_outros_media_semana,
  atual.perguntou_outros_atual AS pct_perguntou_outros_semana_atual
FROM pooled, medias, semana
LEFT JOIN atual ON 1 = 1;
