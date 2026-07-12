import { getUsuarioPorEmail } from './db';
import type { Usuario } from './types';

export const CF_ACCESS_EMAIL_HEADER = 'Cf-Access-Authenticated-User-Email';

export type ResolucaoUsuario =
  | { ok: true; usuario: Usuario }
  | { ok: false; motivo: 'sem-header' | 'nao-cadastrado' };

export async function resolveUsuario(request: Request): Promise<ResolucaoUsuario> {
  const email = request.headers.get(CF_ACCESS_EMAIL_HEADER);
  if (!email) return { ok: false, motivo: 'sem-header' };

  const usuario = await getUsuarioPorEmail(email.trim().toLowerCase());
  if (!usuario) return { ok: false, motivo: 'nao-cadastrado' };

  return { ok: true, usuario };
}

export function ehAdmin(usuario: Usuario | null | undefined): usuario is Usuario {
  return usuario?.papel === 'admin';
}
