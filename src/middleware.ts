import { defineMiddleware } from 'astro:middleware';
import { getUsuarioPorId } from './lib/db';
import { temAcessoArea, type AreaAcesso, type Usuario } from './lib/types';

const ROTAS_PUBLICAS = ['/login', '/api/login'];

// '/admin' e '/api/admin' não entram aqui: são gate própria por papel (ver abaixo), não por área.
function areaDaRota(pathname: string): AreaAcesso | null {
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) return null;
  if (pathname.startsWith('/prospeccao') || pathname.startsWith('/api/prospeccao')) return 'prospeccao';
  if (
    pathname === '/' ||
    pathname.startsWith('/pedidos') ||
    pathname.startsWith('/comercial') ||
    pathname.startsWith('/clientes') ||
    pathname.startsWith('/api/pedidos') ||
    pathname.startsWith('/api/comercial') ||
    pathname.startsWith('/api/clientes')
  ) {
    return 'comercial';
  }
  return null; // /minha-conta, /api/logout etc. — sem restrição de área
}

function primeiraRotaAcessivel(usuario: Usuario): string {
  if (temAcessoArea(usuario, 'comercial')) return '/';
  if (temAcessoArea(usuario, 'prospeccao')) return '/prospeccao';
  return '/minha-conta';
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  let response: Response;

  if (ROTAS_PUBLICAS.includes(pathname) || pathname.startsWith('/_')) {
    response = await next();
  } else {
    const usuarioId = await context.session?.get('usuarioId');
    const usuario = usuarioId ? await getUsuarioPorId(usuarioId) : null;

    if (!usuario) {
      response = context.redirect('/login');
    } else {
      context.locals.usuario = usuario;

      if ((pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) && usuario.papel !== 'admin') {
        response = new Response('Acesso restrito a administradores.', { status: 403 });
      } else {
        const area = areaDaRota(pathname);
        if (area && !temAcessoArea(usuario, area)) {
          // Raiz sem acesso a Comercial: manda pra primeira área liberada em vez de 403 seco,
          // já que "/" é a página de pouso padrão depois do login.
          response =
            pathname === '/'
              ? context.redirect(primeiraRotaAcessivel(usuario))
              : new Response('Acesso restrito — fale com um administrador para liberar esta área.', { status: 403 });
        } else {
          response = await next();
        }
      }
    }
  }

  // Ferramenta interna: nunca deve aparecer em buscadores, mesmo se a URL vazar.
  response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  return response;
});
