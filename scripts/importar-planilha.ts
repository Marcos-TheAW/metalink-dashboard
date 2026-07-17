/**
 * Importa CSVs exportados das abas Clientes / Pedidos / Ações Comerciais da planilha
 * original para o D1, gerando SQL e executando via `wrangler d1 execute`.
 *
 * Uso:
 *   bun run scripts/importar-planilha.ts \
 *     --usuario email@metalinkbuilding.com.br \
 *     [--clientes caminho/Clientes.csv] \
 *     [--pedidos caminho/Pedidos.csv] \
 *     [--acoes caminho/AcoesComerciais.csv] \
 *     [--db metalink-dashboard-db] \
 *     [--remote]
 *
 * O CSV de cada aba deve manter os cabeçalhos originais da planilha:
 *   Clientes:          Cliente | Observação
 *   Pedidos:           Semana (segunda) | Cliente | Canal de Origem | Qtd. de Links |
 *                       Valor Total (R$) | Data do Pedido | Prazo de Entrega |
 *                       Status do Pedido | Link da Planilha de Detalhe
 *   Ações Comerciais:  Semana (segunda) | Cliente / Prospect | Canal | Tipo de Ação |
 *                       Resultado | Observações
 *
 * A coluna "Semana (segunda)" é ignorada: a agregação semanal é sempre calculada via SQL.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CANAIS,
  CANAIS_COMERCIAIS,
  RESULTADOS_ACAO,
  STATUS_PEDIDO,
  TIPOS_ACAO
} from '../src/lib/types';

interface Args {
  usuario: string;
  clientes?: string;
  pedidos?: string;
  acoes?: string;
  db: string;
  remote: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Partial<Args> = { db: 'metalink-dashboard-db', remote: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--usuario':
        args.usuario = argv[++i];
        break;
      case '--clientes':
        args.clientes = argv[++i];
        break;
      case '--pedidos':
        args.pedidos = argv[++i];
        break;
      case '--acoes':
        args.acoes = argv[++i];
        break;
      case '--db':
        args.db = argv[++i];
        break;
      case '--remote':
        args.remote = true;
        break;
      default:
        throw new Error(`Argumento desconhecido: ${arg}`);
    }
  }
  if (!args.usuario) {
    throw new Error('--usuario <email> é obrigatório (dono do registro de importação em "criado_por").');
  }
  if (!args.clientes && !args.pedidos && !args.acoes) {
    throw new Error('Informe ao menos um de --clientes, --pedidos ou --acoes.');
  }
  return args as Args;
}

// ---------- CSV parsing (RFC4180 simples, sem dependências externas) ----------

export function parseCsv(conteudo: string): string[][] {
  const texto = conteudo.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const linhas: string[][] = [];
  let campo = '';
  let linha: string[] = [];
  let dentroDeAspas = false;

  for (let i = 0; i < texto.length; i++) {
    const char = texto[i];
    if (dentroDeAspas) {
      if (char === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          dentroDeAspas = false;
        }
      } else {
        campo += char;
      }
    } else if (char === '"') {
      dentroDeAspas = true;
    } else if (char === ',') {
      linha.push(campo);
      campo = '';
    } else if (char === '\n') {
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = '';
    } else {
      campo += char;
    }
  }
  if (campo.length > 0 || linha.length > 0) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas.filter((l) => l.some((c) => c.trim() !== ''));
}

export function csvParaObjetos(caminho: string): Record<string, string>[] {
  const linhas = parseCsv(readFileSync(caminho, 'utf-8'));
  const [cabecalho, ...resto] = linhas;
  return resto.map((linha) => {
    const obj: Record<string, string> = {};
    cabecalho.forEach((coluna, i) => {
      obj[coluna.trim()] = (linha[i] ?? '').trim();
    });
    return obj;
  });
}

// ---------- Helpers de conversão ----------

export function labelParaValor(lista: { value: string; label: string }[], label: string): string | null {
  const alvo = label.trim().toLowerCase();
  const porLabel = lista.find((o) => o.label.toLowerCase() === alvo);
  if (porLabel) return porLabel.value;
  const porValue = lista.find((o) => o.value.toLowerCase() === alvo);
  return porValue?.value ?? null;
}

export function parseValorReais(texto: string): number {
  let limpo = texto.replace(/[R$\s]/g, '');
  const ultimaVirgula = limpo.lastIndexOf(',');
  const ultimoPonto = limpo.lastIndexOf('.');
  if (ultimaVirgula !== -1 && ultimoPonto !== -1) {
    // O separador decimal é o que aparece por último; o outro é milhar e é descartado.
    limpo = ultimoPonto > ultimaVirgula ? limpo.replace(/,/g, '') : limpo.replace(/\./g, '').replace(',', '.');
  } else if (ultimaVirgula !== -1) {
    limpo = limpo.replace(',', '.');
  }
  const valor = parseFloat(limpo);
  if (!Number.isFinite(valor)) throw new Error(`Valor monetário inválido: "${texto}"`);
  return Math.round(valor * 100);
}

export function parseData(texto: string): string {
  const t = texto.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const match = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (match) {
    const [, a, b, anoTexto] = match;
    let dia = parseInt(a, 10);
    let mes = parseInt(b, 10);
    // Quando o "mês" extraído é >12, os campos estão trocados (formato MM/DD).
    if (mes > 12 && dia <= 12) {
      [dia, mes] = [mes, dia];
    }
    const ano = anoTexto.length === 2 ? 2000 + parseInt(anoTexto, 10) : parseInt(anoTexto, 10);
    return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  }
  throw new Error(`Data inválida: "${texto}" (use DD/MM/AAAA, DD/MM/AA ou AAAA-MM-DD)`);
}

export function sqlString(valor: string | number | null): string {
  if (valor === null || valor === undefined || valor === '') return 'NULL';
  if (typeof valor === 'number') return String(valor);
  return `'${valor.replace(/'/g, "''")}'`;
}

// ---------- wrangler d1 execute ----------

export function executarD1(db: string, remote: boolean, args: string[]): string {
  return execFileSync(
    'node',
    ['node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', db, remote ? '--remote' : '--local', ...args],
    { encoding: 'utf-8' }
  );
}

export function buscarIdUsuario(db: string, remote: boolean, email: string): number {
  const saida = executarD1(db, remote, [
    '--json',
    '--command',
    `SELECT id FROM usuarios WHERE email = '${email.replace(/'/g, "''")}'`
  ]);
  const resultado = JSON.parse(saida);
  const linhas = resultado[0]?.results ?? [];
  if (linhas.length === 0) {
    throw new Error(
      `Usuário "${email}" não encontrado em "usuarios". Cadastre-o antes de importar (ele será o "criado_por" dos registros).`
    );
  }
  return linhas[0].id as number;
}

// ---------- Programa principal ----------

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const nomesClientes = new Set<string>();
  const clientesObs = new Map<string, string | null>();

  const linhasClientes = args.clientes ? csvParaObjetos(args.clientes) : [];
  for (const linha of linhasClientes) {
    const nome = linha['Cliente'];
    if (!nome) continue;
    nomesClientes.add(nome);
    clientesObs.set(nome, linha['Observação'] || null);
  }

  const linhasPedidos = args.pedidos ? csvParaObjetos(args.pedidos) : [];
  for (const linha of linhasPedidos) {
    if (linha['Cliente']) nomesClientes.add(linha['Cliente']);
  }

  const linhasAcoes = args.acoes ? csvParaObjetos(args.acoes) : [];
  for (const linha of linhasAcoes) {
    if (linha['Cliente / Prospect']) nomesClientes.add(linha['Cliente / Prospect']);
  }

  console.log(`Usuário responsável pela importação: buscando id de "${args.usuario}"…`);
  const usuarioId = buscarIdUsuario(args.db, args.remote, args.usuario);
  console.log(`  → usuario_id = ${usuarioId}`);

  const statements: string[] = [];

  for (const nome of nomesClientes) {
    const observacao = clientesObs.get(nome) ?? null;
    statements.push(
      `INSERT INTO clientes (nome, observacao) VALUES (${sqlString(nome)}, ${sqlString(observacao)}) ON CONFLICT(nome) DO NOTHING;`
    );
  }

  const tmpDir = mkdtempSync(join(tmpdir(), 'metalink-import-'));

  if (statements.length > 0) {
    const arquivoClientes = join(tmpDir, 'clientes.sql');
    writeFileSync(arquivoClientes, statements.join('\n'));
    console.log(`Inserindo ${nomesClientes.size} cliente(s)…`);
    executarD1(args.db, args.remote, ['--file', arquivoClientes]);
  }

  console.log('Resolvendo IDs de clientes…');
  const saidaClientes = executarD1(args.db, args.remote, ['--json', '--command', 'SELECT id, nome FROM clientes']);
  const clientesResultado = JSON.parse(saidaClientes);
  const mapaClientes = new Map<string, number>();
  for (const row of clientesResultado[0]?.results ?? []) {
    mapaClientes.set(row.nome, row.id);
  }

  const pedidosStatements: string[] = [];
  let pedidosIgnorados = 0;
  for (const linha of linhasPedidos) {
    const clienteId = mapaClientes.get(linha['Cliente']);
    const canal = labelParaValor(CANAIS, linha['Canal de Origem'] ?? '');
    const status = labelParaValor(STATUS_PEDIDO, linha['Status do Pedido'] ?? '');
    if (!clienteId || !canal || !status || !linha['Data do Pedido']) {
      console.warn(`  ⚠ Pedido ignorado (dados incompletos): ${JSON.stringify(linha)}`);
      pedidosIgnorados++;
      continue;
    }
    const qtdLinks = parseInt(linha['Qtd. de Links'] || '1', 10) || 1;
    const valorCentavos = parseValorReais(linha['Valor Total (R$)'] || '0');
    const dataPedido = parseData(linha['Data do Pedido']);
    const prazoEntrega = linha['Prazo de Entrega'] ? parseData(linha['Prazo de Entrega']) : null;
    const linkDetalhe = linha['Link da Planilha de Detalhe'] || null;
    const observacao = linha['Observação'] || null;

    pedidosStatements.push(
      `INSERT INTO pedidos (cliente_id, canal, qtd_links, valor_centavos, data_pedido, prazo_entrega, status, link_detalhe, observacao, criado_por)
       VALUES (${clienteId}, ${sqlString(canal)}, ${qtdLinks}, ${valorCentavos}, ${sqlString(dataPedido)}, ${sqlString(prazoEntrega)}, ${sqlString(status)}, ${sqlString(linkDetalhe)}, ${sqlString(observacao)}, ${usuarioId});`
    );
  }

  const acoesStatements: string[] = [];
  let acoesIgnoradas = 0;
  for (const linha of linhasAcoes) {
    const clienteId = mapaClientes.get(linha['Cliente / Prospect']);
    const canal = labelParaValor(CANAIS_COMERCIAIS, linha['Canal'] ?? '');
    const tipo = labelParaValor(TIPOS_ACAO, linha['Tipo de Ação'] ?? '');
    const resultado = labelParaValor(RESULTADOS_ACAO, linha['Resultado'] ?? '');
    if (!clienteId || !canal || !tipo || !resultado) {
      console.warn(`  ⚠ Ação ignorada (dados incompletos): ${JSON.stringify(linha)}`);
      acoesIgnoradas++;
      continue;
    }
    const dataAcao = linha['Semana (segunda)'] ? parseData(linha['Semana (segunda)']) : new Date().toISOString().slice(0, 10);
    const observacoes = linha['Observações'] || null;

    acoesStatements.push(
      `INSERT INTO acoes_comerciais (cliente_id, canal, tipo, resultado, observacoes, data_acao, criado_por)
       VALUES (${clienteId}, ${sqlString(canal)}, ${sqlString(tipo)}, ${sqlString(resultado)}, ${sqlString(observacoes)}, ${sqlString(dataAcao)}, ${usuarioId});`
    );
  }

  if (pedidosStatements.length > 0) {
    const arquivoPedidos = join(tmpDir, 'pedidos.sql');
    writeFileSync(arquivoPedidos, pedidosStatements.join('\n'));
    console.log(`Inserindo ${pedidosStatements.length} pedido(s) (${pedidosIgnorados} ignorado(s))…`);
    executarD1(args.db, args.remote, ['--file', arquivoPedidos]);
  }

  if (acoesStatements.length > 0) {
    const arquivoAcoes = join(tmpDir, 'acoes.sql');
    writeFileSync(arquivoAcoes, acoesStatements.join('\n'));
    console.log(`Inserindo ${acoesStatements.length} ação(ões) comercial(is) (${acoesIgnoradas} ignorada(s))…`);
    executarD1(args.db, args.remote, ['--file', arquivoAcoes]);
  }

  console.log('Importação concluída.');
}

// Guarda de entry-point: este arquivo agora também é importado como módulo por
// scripts/importar-registro-sites.ts (reaproveitando os helpers) — sem essa checagem,
// o main() abaixo rodaria de novo (com o argv errado) toda vez que fosse importado.
if (import.meta.main) {
  main().catch((err) => {
    console.error(`Erro na importação: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  });
}
