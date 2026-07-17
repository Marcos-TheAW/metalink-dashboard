import type { APIRoute } from 'astro';
import { autenticar } from '../../lib/auth';

// Nome padrão que o Astro Sessions usa para o cookie (não há override em astro.config.mjs).
const NOME_COOKIE_SESSAO = 'astro-session';
const DURACAO_LEMBRAR_SEGUNDOS = 60 * 60 * 24 * 30; // 30 dias

export const POST: APIRoute = async ({ request, session, cookies, redirect }) => {
  const form = await request.formData();
  const email = String(form.get('email') ?? '').trim();
  const senha = String(form.get('senha') ?? '');
  const lembrar = form.get('lembrar') === 'on';

  if (!email || !senha) {
    return redirect('/login?erro=invalido');
  }

  const resultado = await autenticar(email, senha);
  if (!resultado.ok) {
    return redirect(`/login?erro=${resultado.motivo}`);
  }

  await session?.regenerate();
  session?.set('usuarioId', resultado.usuario.id);

  // Por padrão o cookie de sessão do Astro expira quando o navegador fecha. "Lembre-se de
  // mim" reemite o mesmo cookie (mesmo ID de sessão) com Max-Age longo, sobrescrevendo o
  // Set-Cookie que session.set() já preparou — sem isso o usuário precisaria logar de novo
  // toda vez que fechasse o navegador.
  if (lembrar && session?.sessionID) {
    cookies.set(NOME_COOKIE_SESSAO, session.sessionID, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: import.meta.env.PROD,
      maxAge: DURACAO_LEMBRAR_SEGUNDOS
    });
  }

  return redirect('/');
};
