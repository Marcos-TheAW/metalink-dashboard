import type { APIRoute } from 'astro';
import { autenticar } from '../../lib/auth';

export const POST: APIRoute = async ({ request, session, redirect }) => {
  const form = await request.formData();
  const email = String(form.get('email') ?? '').trim();
  const senha = String(form.get('senha') ?? '');

  if (!email || !senha) {
    return redirect('/login?erro=invalido');
  }

  const resultado = await autenticar(email, senha);
  if (!resultado.ok) {
    return redirect(`/login?erro=${resultado.motivo}`);
  }

  await session?.regenerate();
  session?.set('usuarioId', resultado.usuario.id);

  return redirect('/');
};
