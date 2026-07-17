-- Referência fixa da Tabela de Preços (SOP de negociação), extraída da planilha original.
-- valor_min_centavos = 0 é o marcador para "Até R$X" (faixa 80+, sem piso definido).

INSERT INTO tabela_precos_faixas (ordem, dr_min, dr_max, trafego_min, trafego_max, valor_min_centavos, valor_max_centavos, observacao) VALUES
  (1, 0, 15, 500, 3000, 4000, 7000, NULL),
  (2, 15, 25, 2000, 10000, 5000, 15000, NULL),
  (3, 25, 40, 5000, 20000, 8000, 25000, NULL),
  (4, 40, 60, 5000, 40000, 10000, 45000, NULL),
  (5, 60, 80, 40000, NULL, 35000, 120000, NULL),
  (6, 80, NULL, 40000, NULL, 0, 500000, NULL);

INSERT INTO tabela_precos_red_flags (ordem, sinal_de_alerta, possivel_causa) VALUES
  (1, 'Taxa de resposta < 20%', 'Copy inadequada ou canal errado sendo priorizado'),
  (2, 'Taxa de fechamento < 15% sobre contatados', 'Dificuldade na negociação ou perfil de sites inadequado'),
  (3, '> 40% dos fechamentos acima da tabela de preços', 'Negociação fraca; âncora de preço não está sendo quebrada'),
  (4, '< 50% dos sites com pergunta sobre inserção', 'Não está seguindo o fluxo completo do SOP'),
  (5, '< 50% dos sites com pergunta sobre outros domínios', 'Perdendo oportunidade de ampliar a base de parceiros'),
  (6, '> 30% dos contatos via e-mail (quando WhatsApp disponível)', 'Desvio do protocolo de priorização do SOP');
