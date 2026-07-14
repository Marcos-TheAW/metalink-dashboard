const ITERACOES_PBKDF2 = 100_000;

function bytesParaHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexParaBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function derivarHash(senha: string, salt: Uint8Array): Promise<string> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, [
    'deriveBits'
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: ITERACOES_PBKDF2, hash: 'SHA-256' },
    material,
    256
  );
  return bytesParaHex(new Uint8Array(bits));
}

export async function gerarHashSenha(senha: string): Promise<{ hash: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivarHash(senha, salt);
  return { hash, salt: bytesParaHex(salt) };
}

function iguaisEmTempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) {
    diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diferenca === 0;
}

export async function verificarSenha(senha: string, hashArmazenado: string, saltArmazenado: string): Promise<boolean> {
  const hash = await derivarHash(senha, hexParaBytes(saltArmazenado));
  return iguaisEmTempoConstante(hash, hashArmazenado);
}

const ALFABETO_SENHA_TEMPORARIA = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

export function gerarSenhaTemporaria(tamanho = 12): string {
  const valores = crypto.getRandomValues(new Uint8Array(tamanho));
  return Array.from(valores, (v) => ALFABETO_SENHA_TEMPORARIA[v % ALFABETO_SENHA_TEMPORARIA.length]).join('');
}
