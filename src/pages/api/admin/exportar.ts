import type { APIRoute } from 'astro';
import * as XLSX from 'xlsx';
import {
  getExecucaoComercial,
  getExecucaoVendas,
  getKpisGerais,
  getKpisPorCanal,
  getKpisPorMes,
  getRetencaoClientes,
  listAcoes,
  listClientesStatus,
  listPedidos
} from '../../../lib/db';
import {
  CANAIS,
  CANAIS_COMERCIAIS,
  RESULTADOS_ACAO,
  STATUS_PEDIDO,
  STATUS_RELACIONAMENTO_LABEL,
  TIPOS_ACAO,
  labelFor,
  nomeMes,
  segundaFeiraDaSemana,
  type StatusRelacionamento
} from '../../../lib/types';

export const GET: APIRoute = async ({ locals, url }) => {
  // Checagem redundante: o middleware já bloqueia /api/admin para não-admins,
  // mas a rota também valida por conta própria, caso seja chamada diretamente.
  if (locals.usuario.papel !== 'admin') {
    return new Response('Acesso restrito a administradores.', { status: 403 });
  }

  const status = url.searchParams.get('status') ?? '';
  const dataInicio = url.searchParams.get('data_inicio') ?? '';
  const dataFim = url.searchParams.get('data_fim') ?? '';

  // Clientes e Dashboard não têm filtro: Clientes é uma lista de cadastro/status atual (não um
  // registro datado); Dashboard vem de views SQL que agregam sempre o histórico completo (mesma
  // limitação da Visão Geral da Prospecção — ver /api/admin/prospeccao/exportar.ts).
  const [pedidos, acoes, clientes, kpis, execucaoVendas, porCanal, retencao, porMes, execucaoComercial] =
    await Promise.all([
      listPedidos({ status: status || undefined, dataInicio: dataInicio || undefined, dataFim: dataFim || undefined }),
      listAcoes({ dataInicio: dataInicio || undefined, dataFim: dataFim || undefined }),
      listClientesStatus(),
      getKpisGerais(),
      getExecucaoVendas(),
      getKpisPorCanal(),
      getRetencaoClientes(),
      getKpisPorMes(),
      getExecucaoComercial()
    ]);

  const clientesHeader = [
    'Cliente',
    'Último Pedido',
    'Dias s/ Pedido',
    'Último Contato',
    'Dias s/ Contato',
    'Status de Relacionamento',
    'Total de Pedidos',
    'Receita Total (R$)',
    'Key Account'
  ];
  const clientesRows = clientes.map((c) => [
    c.nome,
    c.ultimo_pedido ?? '',
    c.dias_sem_pedido ?? '',
    c.ultimo_contato ?? '',
    c.dias_sem_contato ?? '',
    STATUS_RELACIONAMENTO_LABEL[c.status_relacionamento as StatusRelacionamento],
    c.total_pedidos,
    c.receita_total_centavos / 100,
    c.key_account ? 'Sim' : 'Não'
  ]);

  const pedidosHeader = [
    'Semana (segunda)',
    'Cliente',
    'Canal de Origem',
    'Qtd. de Links',
    'Valor Total (R$)',
    'Data do Pedido',
    'Prazo de Entrega',
    'Status do Pedido',
    'Link da Planilha de Detalhe',
    'Observação'
  ];
  const pedidosRows = pedidos.map((p) => [
    segundaFeiraDaSemana(p.data_pedido),
    p.cliente_nome,
    labelFor(CANAIS, p.canal),
    p.qtd_links,
    p.valor_centavos / 100,
    p.data_pedido,
    p.prazo_entrega ?? '',
    labelFor(STATUS_PEDIDO, p.status),
    p.link_detalhe ?? '',
    p.observacao ?? ''
  ]);

  const acoesHeader = [
    'Semana (segunda)',
    'Cliente / Prospect',
    'Canal',
    'Tipo de Ação',
    'Resultado',
    'Observações'
  ];
  const acoesRows = acoes.map((a) => [
    segundaFeiraDaSemana(a.data_acao),
    a.cliente_nome,
    labelFor(CANAIS_COMERCIAIS, a.canal),
    labelFor(TIPOS_ACAO, a.tipo),
    labelFor(RESULTADOS_ACAO, a.resultado),
    a.observacoes ?? ''
  ]);

  // ---------- Dashboard (mesmos números da página "/") ----------

  const semanas = execucaoVendas.semanas_decorridas;
  const ticketMedioGeralCentavos =
    execucaoVendas.total_pedidos > 0 ? execucaoVendas.total_receita_centavos / execucaoVendas.total_pedidos : 0;
  const ticketMedioUltimaSemanaCentavos =
    execucaoVendas.ultima_semana_pedidos > 0
      ? execucaoVendas.ultima_semana_receita_centavos / execucaoVendas.ultima_semana_pedidos
      : null;

  const retencaoMap = new Map(retencao.map((r) => [r.status_relacionamento, r.total]));
  const totalClientesComPedido =
    (retencaoMap.get('ativo') ?? 0) + (retencaoMap.get('em_risco') ?? 0) + (retencaoMap.get('perdido') ?? 0);
  const ordemStatus: StatusRelacionamento[] = ['ativo', 'em_risco', 'perdido', 'nunca_comprou'];

  const dashboardLinhas: unknown[][] = [
    ['KPIs Gerais'],
    ['Receita Total (R$)', kpis.receita_total_centavos / 100],
    ['Total de Pedidos', kpis.total_pedidos],
    ['Ticket Médio (R$)', kpis.ticket_medio_centavos / 100],
    ['Taxa de Conversão Comercial (%)', Math.round(kpis.taxa_conversao * 1000) / 10],
    ['Ações Convertidas', kpis.acoes_convertidas],
    ['Total de Ações', kpis.total_acoes],
    ['Receita em Risco (R$)', kpis.receita_em_risco_centavos / 100],
    [],
    ['Execução de Vendas'],
    ['Métrica', 'Total Acumulado', 'Média por Semana', 'Última Semana'],
    [
      'Pedidos Recebidos',
      execucaoVendas.total_pedidos,
      semanas > 0 ? Math.round((execucaoVendas.total_pedidos / semanas) * 10) / 10 : '',
      execucaoVendas.ultima_semana_pedidos
    ],
    [
      'Links Vendidos',
      execucaoVendas.total_links,
      semanas > 0 ? Math.round((execucaoVendas.total_links / semanas) * 10) / 10 : '',
      execucaoVendas.ultima_semana_links
    ],
    [
      'Receita Total (R$)',
      execucaoVendas.total_receita_centavos / 100,
      semanas > 0 ? Math.round(execucaoVendas.total_receita_centavos / semanas) / 100 : '',
      execucaoVendas.ultima_semana_receita_centavos / 100
    ],
    [
      'Ticket Médio por Pedido (R$)',
      ticketMedioGeralCentavos / 100,
      '',
      ticketMedioUltimaSemanaCentavos !== null ? ticketMedioUltimaSemanaCentavos / 100 : ''
    ],
    [],
    ['Receita por Canal'],
    ['Canal', 'Pedidos', 'Receita (R$)'],
    ...porCanal.map((row) => [labelFor(CANAIS, row.canal), row.total_pedidos, row.receita_centavos / 100]),
    [],
    ['Retenção de Clientes'],
    ['Status', 'Clientes', '%'],
    ...ordemStatus.map((s) => [
      STATUS_RELACIONAMENTO_LABEL[s],
      retencaoMap.get(s) ?? 0,
      s === 'nunca_comprou' || totalClientesComPedido === 0
        ? ''
        : Math.round(((retencaoMap.get(s) ?? 0) / totalClientesComPedido) * 1000) / 10
    ]),
    [],
    ['Receita Mensal'],
    ['Mês', 'Pedidos Recebidos', 'Links Vendidos', 'Receita Total (R$)', 'Ticket Médio (R$)'],
    ...porMes.map((row) => [
      nomeMes(row.mes),
      row.total_pedidos,
      row.total_links,
      row.receita_centavos / 100,
      row.ticket_medio_centavos / 100
    ]),
    [],
    ['Execução Comercial (Tipo × Resultado)'],
    ['Tipo de Ação', 'Resultado', 'Total'],
    ...execucaoComercial.map((row) => [labelFor(TIPOS_ACAO, row.tipo), labelFor(RESULTADOS_ACAO, row.resultado), row.total])
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(dashboardLinhas), 'Dashboard');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([clientesHeader, ...clientesRows]), 'Clientes');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([pedidosHeader, ...pedidosRows]), 'Pedidos');
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([acoesHeader, ...acoesRows]),
    'Ações Comerciais'
  );

  const arquivo = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const dataHoje = new Date().toISOString().slice(0, 10);

  return new Response(arquivo, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="metalink-export-${dataHoje}.xlsx"`
    }
  });
};
