import type { APIRoute } from 'astro';
import * as XLSX from 'xlsx';
import {
  getProspeccaoOverviewComercial,
  getProspeccaoOverviewConversao,
  getProspeccaoOverviewQualidade,
  getProspeccaoOverviewVolume,
  listPainelSemanal,
  listSitesProspectados,
  listTabelaPrecoFaixas,
  listTabelaPrecoRedFlags
} from '../../../../lib/db';
import { CABECALHO_MODELO } from '../../../../lib/importacaoSites';
import {
  CANAIS_PROSPECCAO,
  OPCOES_SIM_NAO,
  OPCOES_TRI_ESTADO,
  STATUS_PROSPECCAO,
  TIPOS_CONTATO_PROSPECCAO,
  labelFor
} from '../../../../lib/types';

function centavos(valor: number | null): number | string {
  return valor === null ? '' : valor / 100;
}

// Percentual armazenado como fração (0–1); exporta como número "42.3" (já multiplicado por
// 100, cabeçalho leva o "(%)") em vez de string formatada, pra continuar editável no Excel.
function percentual(valor: number | null): number | string {
  return valor === null ? '' : Math.round(valor * 1000) / 10;
}

type LinhaChaveValor = [string, number | string];

function linhasBloco(titulo: string, linhas: LinhaChaveValor[]): unknown[][] {
  return [[titulo, ''], ...linhas.map(([label, valor]) => [label, valor])];
}

export const GET: APIRoute = async ({ locals }) => {
  // Checagem redundante: o middleware já bloqueia /api/admin para não-admins,
  // mas a rota também valida por conta própria, caso seja chamada diretamente.
  if (locals.usuario.papel !== 'admin') {
    return new Response('Acesso restrito a administradores.', { status: 403 });
  }

  const [sites, painelSemanal, volume, conversao, comercial, qualidade, faixas, redFlags] = await Promise.all([
    listSitesProspectados(),
    listPainelSemanal(),
    getProspeccaoOverviewVolume(),
    getProspeccaoOverviewConversao(),
    getProspeccaoOverviewComercial(),
    getProspeccaoOverviewQualidade(),
    listTabelaPrecoFaixas(),
    listTabelaPrecoRedFlags()
  ]);

  // ---------- Visão Geral (mesmos 4 blocos da página /prospeccao) ----------

  const visaoGeralLinhas: unknown[][] = [
    ...linhasBloco('Volume', [
      ['Sites Contatados — Total', volume.sites_contatados_total],
      ['Sites Contatados — Média por Semana', volume.sites_contatados_media_semana ?? ''],
      ['Sites Contatados — Semana Atual', volume.sites_contatados_semana_atual],
      ['Contatos via WhatsApp — Total', volume.contatos_whatsapp_total],
      ['Contatos via WhatsApp — Média por Semana', volume.contatos_whatsapp_media_semana ?? ''],
      ['Contatos via WhatsApp — Semana Atual', volume.contatos_whatsapp_semana_atual],
      ['Contatos via E-mail — Total', volume.contatos_email_total],
      ['Contatos via E-mail — Média por Semana', volume.contatos_email_media_semana ?? ''],
      ['Contatos via E-mail — Semana Atual', volume.contatos_email_semana_atual],
      ['Follow-ups — Total', volume.followups_total],
      ['Follow-ups — Média por Semana', volume.followups_media_semana ?? ''],
      ['Follow-ups — Semana Atual', volume.followups_semana_atual]
    ]),
    [],
    ...linhasBloco('Conversão', [
      ['Taxa de Resposta (%) — Total', percentual(conversao.taxa_resposta_total)],
      ['Taxa de Resposta (%) — Média por Semana', percentual(conversao.taxa_resposta_media_semana)],
      ['Taxa de Resposta (%) — Semana Atual', percentual(conversao.taxa_resposta_semana_atual)],
      ['Taxa de Negociação (%) — Total', percentual(conversao.taxa_negociacao_total)],
      ['Taxa de Negociação (%) — Média por Semana', percentual(conversao.taxa_negociacao_media_semana)],
      ['Taxa de Negociação (%) — Semana Atual', percentual(conversao.taxa_negociacao_semana_atual)],
      ['Taxa de Fechamento s/ Contatados (%) — Total', percentual(conversao.taxa_fechamento_contatados_total)],
      [
        'Taxa de Fechamento s/ Contatados (%) — Média por Semana',
        percentual(conversao.taxa_fechamento_contatados_media_semana)
      ],
      [
        'Taxa de Fechamento s/ Contatados (%) — Semana Atual',
        percentual(conversao.taxa_fechamento_contatados_semana_atual)
      ],
      ['Taxa de Fechamento s/ Respondentes (%) — Total', percentual(conversao.taxa_fechamento_respondentes_total)],
      [
        'Taxa de Fechamento s/ Respondentes (%) — Média por Semana',
        percentual(conversao.taxa_fechamento_respondentes_media_semana)
      ],
      [
        'Taxa de Fechamento s/ Respondentes (%) — Semana Atual',
        percentual(conversao.taxa_fechamento_respondentes_semana_atual)
      ],
      ['Taxa de Recusa (%) — Total', percentual(conversao.taxa_recusa_total)],
      ['Taxa de Recusa (%) — Média por Semana', percentual(conversao.taxa_recusa_media_semana)],
      ['Taxa de Recusa (%) — Semana Atual', percentual(conversao.taxa_recusa_semana_atual)]
    ]),
    [],
    ...linhasBloco('Resultado Comercial', [
      ['Sites Fechados — Geral', comercial.sites_fechados_geral],
      ['Sites Fechados — Última Semana', comercial.sites_fechados_ultima_semana],
      ['Sites Fechados — Semana Atual', comercial.sites_fechados_semana_atual],
      ['Valor Médio White Hat (R$) — Geral', centavos(comercial.valor_medio_white_geral)],
      ['Valor Médio White Hat (R$) — Última Semana', centavos(comercial.valor_medio_white_ultima_semana)],
      ['Valor Médio White Hat (R$) — Semana Atual', centavos(comercial.valor_medio_white_semana_atual)],
      ['Valor Médio Black Hat (R$) — Geral', centavos(comercial.valor_medio_black_geral)],
      ['Valor Médio Black Hat (R$) — Última Semana', centavos(comercial.valor_medio_black_ultima_semana)],
      ['Valor Médio Black Hat (R$) — Semana Atual', centavos(comercial.valor_medio_black_semana_atual)],
      ['Valor Médio Inserção (R$) — Geral', centavos(comercial.valor_medio_insercao_geral)],
      ['Valor Médio Inserção (R$) — Última Semana', centavos(comercial.valor_medio_insercao_ultima_semana)],
      ['Valor Médio Inserção (R$) — Semana Atual', centavos(comercial.valor_medio_insercao_semana_atual)],
      ['% Aceita Inserção — Geral', percentual(comercial.pct_aceita_insercao_geral)],
      ['% Aceita Inserção — Última Semana', percentual(comercial.pct_aceita_insercao_ultima_semana)],
      ['% Aceita Inserção — Semana Atual', percentual(comercial.pct_aceita_insercao_semana_atual)],
      ['% Administra Outros Sites — Geral', percentual(comercial.pct_administra_outros_geral)],
      ['% Administra Outros Sites — Última Semana', percentual(comercial.pct_administra_outros_ultima_semana)],
      ['% Administra Outros Sites — Semana Atual', percentual(comercial.pct_administra_outros_semana_atual)],
      ['Novos Sites Derivados — Geral', comercial.novos_sites_derivados_geral],
      ['Novos Sites Derivados — Última Semana', comercial.novos_sites_derivados_ultima_semana],
      ['Novos Sites Derivados — Semana Atual', comercial.novos_sites_derivados_semana_atual]
    ]),
    [],
    ...linhasBloco('Qualidade', [
      ['% Dentro da Tabela de Preços — Total', percentual(qualidade.pct_dentro_tabela_total)],
      ['% Dentro da Tabela de Preços — Média por Semana', percentual(qualidade.pct_dentro_tabela_media_semana)],
      ['% Dentro da Tabela de Preços — Semana Atual', percentual(qualidade.pct_dentro_tabela_semana_atual)],
      ['% Pacote Fechado — Total', percentual(qualidade.pct_pacote_fechado_total)],
      ['% Pacote Fechado — Média por Semana', percentual(qualidade.pct_pacote_fechado_media_semana)],
      ['% Pacote Fechado — Semana Atual', percentual(qualidade.pct_pacote_fechado_semana_atual)],
      ['% Perguntou sobre Inserção — Total', percentual(qualidade.pct_perguntou_insercao_total)],
      ['% Perguntou sobre Inserção — Média por Semana', percentual(qualidade.pct_perguntou_insercao_media_semana)],
      ['% Perguntou sobre Inserção — Semana Atual', percentual(qualidade.pct_perguntou_insercao_semana_atual)],
      ['% Perguntou sobre Outros Domínios — Total', percentual(qualidade.pct_perguntou_outros_total)],
      [
        '% Perguntou sobre Outros Domínios — Média por Semana',
        percentual(qualidade.pct_perguntou_outros_media_semana)
      ],
      ['% Perguntou sobre Outros Domínios — Semana Atual', percentual(qualidade.pct_perguntou_outros_semana_atual)]
    ])
  ];

  // ---------- Painel Semanal (uma linha por semana) ----------

  const painelHeader = [
    'Semana (segunda)',
    'Total Contatados',
    'Aguardando Resposta',
    'Respondentes',
    'Via WhatsApp',
    'Via E-mail',
    'Follow-ups',
    'Sites Fechados',
    'Novos Sites Derivados',
    'Taxa de Resposta (%)',
    'Taxa de Negociação (%)',
    'Taxa de Fechamento s/ Contatados (%)',
    'Taxa de Fechamento s/ Respondentes (%)',
    'Taxa de Recusa (%)',
    'Valor Médio White Hat (R$)',
    'Valor Médio Black Hat (R$)',
    'Valor Médio Inserção (R$)',
    '% Aceita Inserção',
    '% Administra Outros Sites',
    '% Dentro da Tabela de Preços',
    '% Pacote Fechado',
    '% Perguntou sobre Inserção',
    '% Perguntou sobre Outros Domínios'
  ];
  const painelRows = painelSemanal.map((s) => [
    s.semana,
    s.total,
    s.aguardando,
    s.respondentes,
    s.via_whatsapp,
    s.via_email,
    s.followups,
    s.sites_fechados,
    s.novos_sites_derivados,
    percentual(s.taxa_resposta),
    percentual(s.taxa_negociacao),
    percentual(s.taxa_fechamento_contatados),
    percentual(s.taxa_fechamento_respondentes),
    percentual(s.taxa_recusa),
    centavos(s.valor_medio_white_centavos),
    centavos(s.valor_medio_black_centavos),
    centavos(s.valor_medio_insercao_centavos),
    percentual(s.pct_aceita_insercao),
    percentual(s.pct_administra_outros_sites),
    percentual(s.pct_dentro_tabela_precos),
    percentual(s.pct_pacote_fechado),
    percentual(s.pct_perguntou_insercao),
    percentual(s.pct_perguntou_outros_dominios)
  ]);

  // ---------- Registro de Sites (uma linha por site prospectado) ----------

  const sitesRows = sites.map((s) => [
    s.url_site,
    s.domain_rating ?? '',
    s.trafego_estimado ?? '',
    s.nicho ?? '',
    labelFor(CANAIS_PROSPECCAO, s.canal),
    labelFor(TIPOS_CONTATO_PROSPECCAO, s.tipo_contato),
    labelFor(STATUS_PROSPECCAO, s.status),
    s.num_tentativas,
    s.data_contato,
    s.link_email ?? '',
    centavos(s.valor_solicitado_white_centavos),
    centavos(s.valor_solicitado_black_centavos),
    centavos(s.valor_fechado_white_centavos),
    centavos(s.valor_fechado_black_centavos),
    centavos(s.valor_fechado_insercao_centavos),
    s.aceita_insercao ? labelFor(OPCOES_TRI_ESTADO, s.aceita_insercao) : '',
    s.aceita_pacote ? labelFor(OPCOES_TRI_ESTADO, s.aceita_pacote) : '',
    s.administra_outros_sites ? labelFor(OPCOES_TRI_ESTADO, s.administra_outros_sites) : '',
    s.outros_sites_urls ?? '',
    s.dentro_tabela_precos ? labelFor(OPCOES_SIM_NAO, s.dentro_tabela_precos) : '',
    s.observacoes ?? ''
  ]);

  // ---------- Tabela de Preços (duas tabelas empilhadas na mesma aba) ----------

  const tabelaPrecosLinhas: unknown[][] = [
    ['Faixas de DR / Tráfego'],
    ['Ordem', 'DR Mín', 'DR Máx', 'Tráfego Mín', 'Tráfego Máx', 'Valor Mín (R$)', 'Valor Máx (R$)', 'Observação'],
    ...faixas.map((f) => [
      f.ordem,
      f.dr_min,
      f.dr_max ?? '',
      f.trafego_min ?? '',
      f.trafego_max ?? '',
      centavos(f.valor_min_centavos),
      centavos(f.valor_max_centavos),
      f.observacao ?? ''
    ]),
    [],
    ['Sinais de Alerta (Red Flags)'],
    ['Ordem', 'Sinal de Alerta', 'Possível Causa'],
    ...redFlags.map((r) => [r.ordem, r.sinal_de_alerta, r.possivel_causa])
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(visaoGeralLinhas), 'Visão Geral');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([painelHeader, ...painelRows]), 'Painel Semanal');
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([CABECALHO_MODELO, ...sitesRows]),
    'Registro de Sites'
  );
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(tabelaPrecosLinhas), 'Tabela de Preços');

  const arquivo = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const dataHoje = new Date().toISOString().slice(0, 10);

  return new Response(arquivo, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="metalink-prospeccao-export-${dataHoje}.xlsx"`
    }
  });
};
