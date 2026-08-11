import type { APIRoute } from 'astro';
import { criarCliente } from '../../../lib/db';

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const nome = String(form.get('nome') ?? '').trim();
  const observacao = String(form.get('observacao') ?? '').trim() || null;
  // Contato/faturamento: opcionais por definição, vazio virando NULL. Sem validação de
  // formato de propósito — um erro aqui redirecionaria com ?erro= e descartaria tudo que
  // já foi digitado (o formulário não preserva estado), o que não se paga num campo que
  // o usuário pode deixar em branco e completar depois.
  const cnpjCpf = String(form.get('cnpj_cpf') ?? '').trim() || null;
  const telefoneWhatsapp = String(form.get('telefone_whatsapp') ?? '').trim() || null;
  const endereco = String(form.get('endereco') ?? '').trim() || null;
  const email = String(form.get('email') ?? '').trim() || null;

  if (!nome) {
    return redirect(`/clientes?erro=${encodeURIComponent('Nome do cliente é obrigatório.')}`);
  }

  try {
    await criarCliente({
      nome,
      observacao,
      cnpj_cpf: cnpjCpf,
      telefone_whatsapp: telefoneWhatsapp,
      endereco,
      email
    });
  } catch {
    return redirect(`/clientes?erro=${encodeURIComponent('Já existe um cliente com esse nome.')}`);
  }

  return redirect('/clientes');
};
