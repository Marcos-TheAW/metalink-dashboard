import type { APIRoute } from 'astro';
import { deletarPedido } from '../../../../lib/db';

export const POST: APIRoute = async ({ params, redirect }) => {
  const id = Number(params.id);
  if (Number.isFinite(id)) {
    await deletarPedido(id);
  }
  return redirect('/pedidos');
};
