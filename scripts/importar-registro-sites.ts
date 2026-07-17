/**
 * Importa o CSV exportado da aba "📋 Registro de Sites" da planilha "Controle de Novos
 * Parceiros Contatados" para a tabela sites_prospectados no D1.
 *
 * Uso:
 *   bun run scripts/importar-registro-sites.ts \
 *     --usuario email@metalinkbuilding.com.br \
 *     --csv caminho/RegistroDeSites.csv \
 *     [--db metalink-dashboard-db] \
 *     [--remote]
 *
 * Parsing é posicional (não por nome de cabeçalho) porque exports de CSV do Google
 * Sheets frequentemente corrompem acentos/travessões dependendo do encoding de saída —
 * a ordem das colunas é estável, os nomes exatos não. Ordem esperada das 21 colunas
 * (igual à aba original, cabeçalho na 4ª linha do CSV, 3 linhas de instrução acima):
 *   URL do Site | DR | Tráfego Estimado | Nicho / Segmento | Canal Utilizado |
 *   Tipo de Contato | Status Atual | Nº de Tentativas |
 *   Data do Contato (segunda-feira da semana) | Link do E-mail |
 *   Valor Solicitado – White Hat (R$) | Valor Solicitado – Black Hat (R$) |
 *   Valor Fechado – White Hat (R$) | Valor Fechado – Black Hat (R$) |
 *   Valor Fechado – Inserção (R$) | Aceita Inserção? | Aceita Pacote? |
 *   Adm. Outros Sites? | Outros Sites (URLs) | Dentro da tabela de preços? | Observações
 *
 * Linhas com "URL do Site" vazio são ignoradas (a planilha tem linhas de instrução/aviso
 * antes do cabeçalho real). Não há importador para tabela_precos_faixas/red_flags —
 * já semeadas via migrations/0008_seed_tabela_precos.sql.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buscarIdUsuario,
  executarD1,
  labelParaValor,
  parseCsv,
  parseData,
  parseValorReais,
  sqlString
} from './importar-planilha';
import {
  CANAIS_PROSPECCAO,
  OPCOES_SIM_NAO,
  OPCOES_TRI_ESTADO,
  STATUS_PROSPECCAO,
  TIPOS_CONTATO_PROSPECCAO,
  segundaFeiraDaSemana
} from '../src/lib/types';

interface Args {
  usuario: string;
  csv: string;
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
      case '--csv':
        args.csv = argv[++i];
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
  if (!args.csv) {
    throw new Error('--csv <caminho> é obrigatório.');
  }
  return args as Args;
}

// ---------- Índices das colunas (posicional, ver cabeçalho do arquivo) ----------

const IDX = {
  url: 0,
  dr: 1,
  trafego: 2,
  nicho: 3,
  canal: 4,
  tipoContato: 5,
  status: 6,
  tentativas: 7,
  data: 8,
  linkEmail: 9,
  valorSolicitadoWhite: 10,
  valorSolicitadoBlack: 11,
  valorFechadoWhite: 12,
  valorFechadoBlack: 13,
  valorFechadoInsercao: 14,
  aceitaInsercao: 15,
  aceitaPacote: 16,
  administraOutrosSites: 17,
  outrosSitesUrls: 18,
  dentroTabelaPrecos: 19,
  observacoes: 20
};

// ---------- Helpers de conversão ----------

function ehVazio(texto: string | undefined): boolean {
  const t = (texto ?? '').trim();
  return t === '' || t.toLowerCase() === 'none';
}

function textoOuNull(texto: string | undefined): string | null {
  return ehVazio(texto) ? null : (texto as string).trim();
}

function limparTrafego(texto: string | undefined): number | null {
  if (ehVazio(texto)) return null;
  const limpo = (texto as string).replace(/[^\d]/g, '');
  if (!limpo) return null;
  const n = parseInt(limpo, 10);
  return Number.isFinite(n) ? n : null;
}

function inteiroOuNull(texto: string | undefined): number | null {
  if (ehVazio(texto)) return null;
  const n = parseInt((texto as string).replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

function dinheiroOuNull(texto: string | undefined): number | null {
  if (ehVazio(texto)) return null;
  try {
    return parseValorReais(texto as string);
  } catch {
    return null;
  }
}

function enumOuNull(lista: { value: string; label: string }[], texto: string | undefined): string | null {
  if (ehVazio(texto)) return null;
  return labelParaValor(lista, texto as string);
}

// ---------- Programa principal ----------

async function main() {
  const args = parseArgs(process.argv.slice(2));

  console.log(`Usuário responsável pela importação: buscando id de "${args.usuario}"…`);
  const usuarioId = buscarIdUsuario(args.db, args.remote, args.usuario);
  console.log(`  → usuario_id = ${usuarioId}`);

  const conteudo = readFileSync(args.csv, 'utf-8');
  const todasAsLinhas = parseCsv(conteudo);

  const indiceCabecalho = todasAsLinhas.findIndex((linha) => (linha[0] ?? '').trim() === 'URL do Site');
  if (indiceCabecalho === -1) {
    throw new Error('Cabeçalho "URL do Site" não encontrado na primeira coluna do CSV — verifique o arquivo.');
  }
  const linhasDados = todasAsLinhas.slice(indiceCabecalho + 1);

  const statements: string[] = [];
  let ignoradas = 0;

  for (const linha of linhasDados) {
    const urlSite = linha[IDX.url];
    if (ehVazio(urlSite)) {
      ignoradas++;
      continue;
    }

    const canal = labelParaValor(CANAIS_PROSPECCAO, linha[IDX.canal] ?? '');
    const tipoContato = labelParaValor(TIPOS_CONTATO_PROSPECCAO, linha[IDX.tipoContato] ?? '');
    const status = labelParaValor(STATUS_PROSPECCAO, linha[IDX.status] ?? '');
    const dataContatoTexto = linha[IDX.data];

    if (!canal || !tipoContato || !status || ehVazio(dataContatoTexto)) {
      console.warn(`  ⚠ Linha ignorada (dados obrigatórios incompletos): ${JSON.stringify(linha)}`);
      ignoradas++;
      continue;
    }

    const dataContato = parseData(dataContatoTexto as string);
    const segundaEsperada = segundaFeiraDaSemana(dataContato);
    if (dataContato !== segundaEsperada) {
      console.warn(
        `  ⚠ "${urlSite}": Data do Contato (${dataContato}) não é uma segunda-feira — ajustada para ${segundaEsperada}.`
      );
    }

    const numTentativas = inteiroOuNull(linha[IDX.tentativas]) ?? 1;
    const domainRating = inteiroOuNull(linha[IDX.dr]);
    const trafegoEstimado = limparTrafego(linha[IDX.trafego]);
    const nicho = textoOuNull(linha[IDX.nicho]);
    const linkEmail = textoOuNull(linha[IDX.linkEmail]);
    const valorSolicitadoWhite = dinheiroOuNull(linha[IDX.valorSolicitadoWhite]);
    const valorSolicitadoBlack = dinheiroOuNull(linha[IDX.valorSolicitadoBlack]);
    const valorFechadoWhite = dinheiroOuNull(linha[IDX.valorFechadoWhite]);
    const valorFechadoBlack = dinheiroOuNull(linha[IDX.valorFechadoBlack]);
    const valorFechadoInsercao = dinheiroOuNull(linha[IDX.valorFechadoInsercao]);
    const aceitaInsercao = enumOuNull(OPCOES_TRI_ESTADO, linha[IDX.aceitaInsercao]);
    const aceitaPacote = enumOuNull(OPCOES_TRI_ESTADO, linha[IDX.aceitaPacote]);
    const administraOutrosSites = enumOuNull(OPCOES_TRI_ESTADO, linha[IDX.administraOutrosSites]);
    const outrosSitesUrls = textoOuNull(linha[IDX.outrosSitesUrls]);
    const dentroTabelaPrecos = enumOuNull(OPCOES_SIM_NAO, linha[IDX.dentroTabelaPrecos]);
    const observacoes = textoOuNull(linha[IDX.observacoes]);

    statements.push(
      `INSERT INTO sites_prospectados
         (url_site, domain_rating, trafego_estimado, nicho, canal, tipo_contato, status, num_tentativas,
          data_contato, link_email, valor_solicitado_white_centavos, valor_solicitado_black_centavos,
          valor_fechado_white_centavos, valor_fechado_black_centavos, valor_fechado_insercao_centavos,
          aceita_insercao, aceita_pacote, administra_outros_sites, outros_sites_urls, dentro_tabela_precos,
          observacoes, criado_por)
       VALUES (${sqlString((urlSite as string).trim())}, ${sqlString(domainRating)}, ${sqlString(trafegoEstimado)}, ${sqlString(nicho)},
               ${sqlString(canal)}, ${sqlString(tipoContato)}, ${sqlString(status)}, ${numTentativas},
               ${sqlString(dataContato)}, ${sqlString(linkEmail)}, ${sqlString(valorSolicitadoWhite)}, ${sqlString(valorSolicitadoBlack)},
               ${sqlString(valorFechadoWhite)}, ${sqlString(valorFechadoBlack)}, ${sqlString(valorFechadoInsercao)},
               ${sqlString(aceitaInsercao)}, ${sqlString(aceitaPacote)}, ${sqlString(administraOutrosSites)}, ${sqlString(outrosSitesUrls)},
               ${sqlString(dentroTabelaPrecos)}, ${sqlString(observacoes)}, ${usuarioId});`
    );
  }

  if (statements.length > 0) {
    const tmpDir = mkdtempSync(join(tmpdir(), 'metalink-import-'));
    const arquivo = join(tmpDir, 'sites_prospectados.sql');
    writeFileSync(arquivo, statements.join('\n'));
    console.log(`Inserindo ${statements.length} site(s) prospectado(s) (${ignoradas} ignorado(s))…`);
    executarD1(args.db, args.remote, ['--file', arquivo]);
  } else {
    console.log(`Nenhum site válido para importar (${ignoradas} linha(s) ignorada(s)).`);
  }

  console.log('Importação concluída.');
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(`Erro na importação: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  });
}
