import type { APIRoute } from 'astro';
import { atualizarPedido } from '../../../lib/db';
import { CANAIS, STATUS_PEDIDO } from '../../../lib/types';

export const POST: APIRoute = async ({ request, params, locals, redirect }) => {
  const id = Number(params.id);
  const form = await request.formData();

  const clienteId = Number(form.get('cliente_id'));
  const canal = String(form.get('canal') ?? '');
  const qtdLinks = Number(form.get('qtd_links') ?? 1);
  const valorReais = String(form.get('valor_reais') ?? '').replace(',', '.');
  const dataPedido = String(form.get('data_pedido') ?? '');
  const prazoEntrega = String(form.get('prazo_entrega') ?? '').trim() || null;
  const status = String(form.get('status') ?? '');
  const linkDetalhe = String(form.get('link_detalhe') ?? '').trim() || null;
  const responsavelIdRaw = String(form.get('responsavel_id') ?? '');
  const responsavelId = responsavelIdRaw ? Number(responsavelIdRaw) : null;
  const valorCentavos = Math.round(parseFloat(valorReais) * 100);

  const erros: string[] = [];
  if (!Number.isFinite(id)) erros.push('Pedido inválido.');
  if (!clienteId) erros.push('Cliente é obrigatório.');
  if (!CANAIS.some((c) => c.value === canal)) erros.push('Canal inválido.');
  if (!STATUS_PEDIDO.some((s) => s.value === status)) erros.push('Status inválido.');
  if (!dataPedido) erros.push('Data do pedido é obrigatória.');
  if (!Number.isFinite(valorCentavos) || valorCentavos <= 0) erros.push('Valor deve ser maior que zero.');
  if (!Number.isFinite(qtdLinks) || qtdLinks < 1) erros.push('Quantidade de links deve ser ao menos 1.');

  if (erros.length > 0) {
    return redirect(`/pedidos/${id}?erro=${encodeURIComponent(erros.join(' '))}`);
  }

  await atualizarPedido(
    id,
    {
      cliente_id: clienteId,
      canal,
      qtd_links: qtdLinks,
      valor_centavos: valorCentavos,
      data_pedido: dataPedido,
      prazo_entrega: prazoEntrega,
      status,
      link_detalhe: linkDetalhe,
      responsavel_id: responsavelId
    },
    locals.usuario.id
  );

  return redirect(`/pedidos/${id}`);
};
