import type { APIRoute } from 'astro';
import { atualizarTabelaPrecoRedFlag } from '../../../../../lib/db';

export const POST: APIRoute = async ({ request, params, locals, redirect }) => {
  // Checagem redundante: /prospeccao/tabela-precos não está sob /admin, então o
  // middleware não bloqueia automaticamente — o gate precisa estar aqui.
  if (locals.usuario.papel !== 'admin') {
    return new Response('Acesso restrito a administradores.', { status: 403 });
  }

  const id = Number(params.id);
  const form = await request.formData();

  const ordem = Number(form.get('ordem'));
  const sinalDeAlerta = String(form.get('sinal_de_alerta') ?? '').trim();
  const possivelCausa = String(form.get('possivel_causa') ?? '').trim();

  const erros: string[] = [];
  if (!Number.isFinite(id)) erros.push('Red flag inválida.');
  if (!Number.isFinite(ordem)) erros.push('Ordem inválida.');
  if (!sinalDeAlerta) erros.push('Sinal de alerta é obrigatório.');
  if (!possivelCausa) erros.push('Possível causa é obrigatória.');

  if (erros.length > 0) {
    return redirect(`/prospeccao/tabela-precos?erro=${encodeURIComponent(erros.join(' '))}`);
  }

  await atualizarTabelaPrecoRedFlag(id, { ordem, sinal_de_alerta: sinalDeAlerta, possivel_causa: possivelCausa }, locals.usuario.id);

  return redirect('/prospeccao/tabela-precos');
};
