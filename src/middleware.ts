import { defineMiddleware } from 'astro:middleware';
import { resolveUsuario } from './lib/auth';

const ROTAS_PUBLICAS = ['/sem-acesso'];

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  let response: Response;

  if (ROTAS_PUBLICAS.includes(pathname) || pathname.startsWith('/_')) {
    response = await next();
  } else {
    const resolucao = await resolveUsuario(context.request);

    if (!resolucao.ok) {
      response = context.redirect(`/sem-acesso?motivo=${resolucao.motivo}`);
    } else {
      const { usuario } = resolucao;
      context.locals.usuario = usuario;

      if ((pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) && usuario.papel !== 'admin') {
        response = new Response('Acesso restrito a administradores.', { status: 403 });
      } else {
        response = await next();
      }
    }
  }

  // Ferramenta interna: nunca deve aparecer em buscadores, mesmo se a URL vazar.
  response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  return response;
});
