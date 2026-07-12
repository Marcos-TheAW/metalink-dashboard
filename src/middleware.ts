import { defineMiddleware } from 'astro:middleware';
import { resolveUsuario } from './lib/auth';

const ROTAS_PUBLICAS = ['/sem-acesso'];

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  if (ROTAS_PUBLICAS.includes(pathname) || pathname.startsWith('/_')) {
    return next();
  }

  const usuario = await resolveUsuario(context.request);

  if (!usuario) {
    return context.redirect('/sem-acesso');
  }

  context.locals.usuario = usuario;

  if ((pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) && usuario.papel !== 'admin') {
    return new Response('Acesso restrito a administradores.', { status: 403 });
  }

  return next();
});
