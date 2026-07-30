import type { APIRoute } from 'astro';
import { criarPedido, existePedidoDuplicado } from '../../../lib/db';
import { CANAIS, STATUS_PEDIDO, formatarDataBR, normalizarUrl } from '../../../lib/types';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const form = await request.formData();

  const clienteId = Number(form.get('cliente_id'));
  const canal = String(form.get('canal') ?? '');
  const qtdLinks = Number(form.get('qtd_links') ?? 1);
  const valorReais = String(form.get('valor_reais') ?? '').replace(',', '.');
  const dataPedido = String(form.get('data_pedido') ?? '');
  const prazoEntrega = String(form.get('prazo_entrega') ?? '').trim() || null;
  const status = String(form.get('status') ?? '');
  const linkDetalheBruto = String(form.get('link_detalhe') ?? '').trim();
  const linkDetalhe = linkDetalheBruto ? normalizarUrl(linkDetalheBruto) : null;
  const observacao = String(form.get('observacao') ?? '').trim() || null;
  const responsavelIdRaw = String(form.get('responsavel_id') ?? '');
  const responsavelId = responsavelIdRaw ? Number(responsavelIdRaw) : null;
  const valorCentavos = Math.round(parseFloat(valorReais) * 100);

  const erros: string[] = [];
  if (!clienteId) erros.push('Cliente é obrigatório.');
  if (!CANAIS.some((c) => c.value === canal)) erros.push('Canal inválido.');
  if (!STATUS_PEDIDO.some((s) => s.value === status)) erros.push('Status inválido.');
  if (!dataPedido) erros.push('Data do pedido é obrigatória.');
  if (!Number.isFinite(valorCentavos) || valorCentavos <= 0) erros.push('Valor deve ser maior que zero.');
  if (!Number.isFinite(qtdLinks) || qtdLinks < 1) erros.push('Quantidade de links deve ser ao menos 1.');
  if (linkDetalhe) {
    try {
      new URL(linkDetalhe);
    } catch {
      erros.push('Link da planilha de detalhe inválido.');
    }
  }

  if (erros.length === 0 && clienteId && Number.isFinite(valorCentavos)) {
    const duplicado = await existePedidoDuplicado(clienteId, valorCentavos, linkDetalhe);
    if (duplicado) {
      erros.push(
        `Já existe um pedido idêntico (mesmo cliente, valor e link) cadastrado em ${formatarDataBR(duplicado.data_pedido)} — pedido #${duplicado.id}. Se for um pedido novo de verdade, ajuste o valor ou o link antes de salvar.`
      );
    }
  }

  if (erros.length > 0) {
    return redirect(`/pedidos/novo?erro=${encodeURIComponent(erros.join(' '))}`);
  }

  const id = await criarPedido(
    {
      cliente_id: clienteId,
      canal,
      qtd_links: qtdLinks,
      valor_centavos: valorCentavos,
      data_pedido: dataPedido,
      prazo_entrega: prazoEntrega,
      status,
      link_detalhe: linkDetalhe,
      observacao,
      responsavel_id: responsavelId
    },
    locals.usuario.id
  );

  return redirect(`/pedidos/${id}`);
};
