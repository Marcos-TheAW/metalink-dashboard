import { getUsuarioPorEmail } from './db';
import type { Usuario } from './types';

export const CF_ACCESS_EMAIL_HEADER = 'Cf-Access-Authenticated-User-Email';

export async function resolveUsuario(request: Request): Promise<Usuario | null> {
  const email = request.headers.get(CF_ACCESS_EMAIL_HEADER);
  if (!email) return null;
  return getUsuarioPorEmail(email.trim().toLowerCase());
}

export function ehAdmin(usuario: Usuario | null | undefined): usuario is Usuario {
  return usuario?.papel === 'admin';
}
