import type { APIRoute } from 'astro';
import * as XLSX from 'xlsx';
import { listAcoes, listClientesStatus, listPedidos } from '../../../lib/db';
import {
  CANAIS,
  CANAIS_COMERCIAIS,
  RESULTADOS_ACAO,
  STATUS_PEDIDO,
  STATUS_RELACIONAMENTO_LABEL,
  TIPOS_ACAO,
  labelFor,
  segundaFeiraDaSemana,
  type StatusRelacionamento
} from '../../../lib/types';

export const GET: APIRoute = async ({ locals }) => {
  // Checagem redundante: o middleware já bloqueia /api/admin para não-admins,
  // mas a rota também valida por conta própria, caso seja chamada diretamente.
  if (locals.usuario.papel !== 'admin') {
    return new Response('Acesso restrito a administradores.', { status: 403 });
  }

  const [pedidos, acoes, clientes] = await Promise.all([
    listPedidos(),
    listAcoes(),
    listClientesStatus()
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

  const workbook = XLSX.utils.book_new();
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
