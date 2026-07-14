import { getCredenciaisPorEmail, registrarTentativaFalha, resetarTentativasFalha } from './db';
import { verificarSenha } from './senha';
import type { Usuario } from './types';

export type ResultadoLogin =
  | { ok: true; usuario: Usuario }
  | { ok: false; motivo: 'invalido' | 'bloqueado' | 'inativo' };

export async function autenticar(email: string, senha: string): Promise<ResultadoLogin> {
  const credenciais = await getCredenciaisPorEmail(email.trim().toLowerCase());

  if (!credenciais || !credenciais.senha_hash || !credenciais.senha_salt) {
    return { ok: false, motivo: 'invalido' };
  }

  if (credenciais.bloqueado_ate && new Date(credenciais.bloqueado_ate + 'Z').getTime() > Date.now()) {
    return { ok: false, motivo: 'bloqueado' };
  }

  const senhaCorreta = await verificarSenha(senha, credenciais.senha_hash, credenciais.senha_salt);
  if (!senhaCorreta) {
    await registrarTentativaFalha(credenciais.id);
    return { ok: false, motivo: 'invalido' };
  }

  if (!credenciais.ativo) {
    return { ok: false, motivo: 'inativo' };
  }

  await resetarTentativasFalha(credenciais.id);

  const { senha_hash, senha_salt, tentativas_falhas, bloqueado_ate, ...usuario } = credenciais;
  return { ok: true, usuario };
}

export function ehAdmin(usuario: Usuario | null | undefined): usuario is Usuario {
  return usuario?.papel === 'admin';
}
