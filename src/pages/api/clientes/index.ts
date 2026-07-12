import type { APIRoute } from 'astro';
import { criarCliente } from '../../../lib/db';

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const nome = String(form.get('nome') ?? '').trim();
  const observacao = String(form.get('observacao') ?? '').trim() || null;

  if (!nome) {
    return redirect(`/clientes?erro=${encodeURIComponent('Nome do cliente é obrigatório.')}`);
  }

  try {
    await criarCliente(nome, observacao);
  } catch {
    return redirect(`/clientes?erro=${encodeURIComponent('Já existe um cliente com esse nome.')}`);
  }

  return redirect('/clientes');
};
