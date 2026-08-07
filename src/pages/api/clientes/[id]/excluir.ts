import type { APIRoute } from 'astro';
import { contarDependenciasCliente, deletarCliente, getCliente } from '../../../../lib/db';

export const POST: APIRoute = async ({ params, redirect }) => {
  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    return redirect(`/clientes?erro=${encodeURIComponent('Cliente inválido.')}`);
  }

  const cliente = await getCliente(id);
  if (!cliente) {
    return redirect(`/clientes?erro=${encodeURIComponent('Cliente não encontrado.')}`);
  }

  const { pedidos, acoes } = await contarDependenciasCliente(id);
  if (pedidos > 0 || acoes > 0) {
    const partes: string[] = [];
    if (pedidos > 0) partes.push(`${pedidos} pedido(s)`);
    if (acoes > 0) partes.push(`${acoes} ação(ões) comercial(is)`);
    const mensagem = `Não é possível excluir "${cliente.nome}": ainda existem ${partes.join(' e ')} vinculados a esse cliente. Exclua esses registros primeiro.`;
    return redirect(`/clientes?erro=${encodeURIComponent(mensagem)}`);
  }

  try {
    await deletarCliente(id);
  } catch {
    return redirect(`/clientes?erro=${encodeURIComponent('Falha ao excluir o cliente.')}`);
  }

  return redirect('/clientes');
};
