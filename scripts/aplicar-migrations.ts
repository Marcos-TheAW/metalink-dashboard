/**
 * Aplica todas as migrations em migrations/*.sql, em ordem, contra o D1 local
 * ou remoto. Substitui a antiga cadeia manual no package.json (fácil esquecer
 * de adicionar uma migration nova nela).
 *
 * Uso: bun run scripts/aplicar-migrations.ts [--remote]
 */
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const remoto = process.argv.includes('--remote');
const pastaMigrations = join(import.meta.dirname, '..', 'migrations');
const arquivos = readdirSync(pastaMigrations)
  .filter((nome) => nome.endsWith('.sql'))
  .sort();

for (const arquivo of arquivos) {
  console.log(`\n→ ${arquivo}${remoto ? ' (remoto)' : ' (local)'}`);
  execFileSync(
    'node',
    [
      'node_modules/wrangler/bin/wrangler.js',
      'd1',
      'execute',
      'metalink-dashboard-db',
      remoto ? '--remote' : '--local',
      `--file=./migrations/${arquivo}`
    ],
    { stdio: 'inherit' }
  );
}

console.log('\nTodas as migrations aplicadas.');
