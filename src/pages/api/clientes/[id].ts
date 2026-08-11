import type { APIRoute } from 'astro';
import { atualizarCliente } from '../../../lib/db';

export const POST: APIRoute = async ({ request, params, locals, redirect }) => {
  const id = Number(params.id);
  const form = await request.formData();
  const nome = String(form.get('nome') ?? '').trim();
  const observacao = String(form.get('observacao') ?? '').trim() || null;
  const cnpjCpf = String(form.get('cnpj_cpf') ?? '').trim() || null;
  const telefoneWhatsapp = String(form.get('telefone_whatsapp') ?? '').trim() || null;
  const endereco = String(form.get('endereco') ?? '').trim() || null;
  const email = String(form.get('email') ?? '').trim() || null;

  if (!Number.isFinite(id) || !nome) {
    return redirect(`/clientes?erro=${encodeURIComponent('Nome do cliente é obrigatório.')}`);
  }

  try {
    await atualizarCliente(
      id,
      {
        nome,
        observacao,
        cnpj_cpf: cnpjCpf,
        telefone_whatsapp: telefoneWhatsapp,
        endereco,
        email
      },
      locals.usuario.id
    );
  } catch (e) {
    const texto = e instanceof Error ? e.message : String(e);
    const mensagem = texto.includes('UNIQUE') ? 'Já existe um cliente com esse nome.' : 'Falha ao atualizar o cliente.';
    return redirect(`/clientes?erro=${encodeURIComponent(mensagem)}`);
  }

  return redirect('/clientes');
};
