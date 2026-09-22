import type { APIRoute } from 'astro';
import * as XLSX from 'xlsx';
import { CABECALHO_ATUALIZACAO_PEDIDOS } from '../../../../lib/importacao';
import { listPedidos } from '../../../../lib/db';
import { CANAIS, STATUS_PEDIDO, labelFor, segundaFeiraDaSemana } from '../../../../lib/types';

export const GET: APIRoute = async ({ locals }) => {
  // Checagem redundante: o middleware já bloqueia /api/admin para não-admins.
  if (locals.usuario.papel !== 'admin') {
    return new Response('Acesso restrito a administradores.', { status: 403 });
  }

  const pedidos = await listPedidos({});

  const linhas = pedidos.map((p) => [
    p.id,
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

  const workbook = XLSX.utils.book_new();
  const planilha = XLSX.utils.aoa_to_sheet([CABECALHO_ATUALIZACAO_PEDIDOS, ...linhas]);
  planilha['!cols'] = CABECALHO_ATUALIZACAO_PEDIDOS.map((titulo) => ({ wch: Math.max(titulo.length, 12) }));
  XLSX.utils.book_append_sheet(workbook, planilha, 'Pedidos');

  const arquivo = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const dataHoje = new Date().toISOString().slice(0, 10);

  return new Response(arquivo, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="pedidos-atualizacao-${dataHoje}.xlsx"`
    }
  });
};
