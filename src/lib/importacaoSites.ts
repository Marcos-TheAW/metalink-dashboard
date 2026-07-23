import * as XLSX from 'xlsx';
import { db } from './db';
import {
  CANAIS_PROSPECCAO,
  OPCOES_SIM_NAO,
  OPCOES_TRI_ESTADO,
  STATUS_PROSPECCAO,
  TIPOS_CONTATO_PROSPECCAO,
  segundaFeiraDaSemana
} from './types';

type Linha = Record<string, string>;

export const CABECALHO_MODELO = [
  'URL do Site',
  'DR',
  'Tráfego Estimado',
  'Nicho / Segmento',
  'Canal Utilizado',
  'Tipo de Contato',
  'Status Atual',
  'Nº de Tentativas',
  'Data do Contato (segunda-feira da semana)',
  'Link do E-mail',
  'Valor Solicitado – White Hat (R$)',
  'Valor Solicitado – Black Hat (R$)',
  'Valor Fechado – White Hat (R$)',
  'Valor Fechado – Black Hat (R$)',
  'Valor Fechado – Inserção (R$)',
  'Aceita Inserção?',
  'Aceita Pacote?',
  'Adm. Outros Sites?',
  'Outros Sites (URLs)',
  'Dentro da tabela de preços?',
  'Observações'
];

function normalizarChaves(linha: Linha): Linha {
  const normalizada: Linha = {};
  for (const [chave, valor] of Object.entries(linha)) {
    normalizada[chave.trim()] = typeof valor === 'string' ? valor : String(valor ?? '');
  }
  return normalizada;
}

function normalizarNomeAba(nome: string): string {
  return nome
    .replace(/[^\p{L}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function encontrarPlanilha(workbook: XLSX.WorkBook): XLSX.WorkSheet {
  const alvo = normalizarNomeAba('Registro de Sites');
  const nomeReal = workbook.SheetNames.find((n) => normalizarNomeAba(n) === alvo);
  const nome = nomeReal ?? workbook.SheetNames[0];
  return workbook.Sheets[nome];
}

function labelParaValor(lista: { value: string; label: string }[], texto: string): string | null {
  const alvo = texto.trim().toLowerCase();
  if (!alvo) return null;
  const porLabel = lista.find((o) => o.label.toLowerCase() === alvo);
  if (porLabel) return porLabel.value;
  const porValue = lista.find((o) => o.value.toLowerCase() === alvo);
  return porValue?.value ?? null;
}

function parseValorReais(texto: string): number | null {
  let limpo = texto.replace(/[R$\s]/g, '');
  if (!limpo) return null;
  const ultimaVirgula = limpo.lastIndexOf(',');
  const ultimoPonto = limpo.lastIndexOf('.');
  if (ultimaVirgula !== -1 && ultimoPonto !== -1) {
    limpo = ultimoPonto > ultimaVirgula ? limpo.replace(/,/g, '') : limpo.replace(/\./g, '').replace(',', '.');
  } else if (ultimaVirgula !== -1) {
    limpo = limpo.replace(',', '.');
  }
  const valor = parseFloat(limpo);
  return Number.isFinite(valor) ? Math.round(valor * 100) : null;
}

function parseData(texto: string): string | null {
  const t = texto.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const match = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (match) {
    const [, a, b, anoTexto] = match;
    let dia = parseInt(a, 10);
    let mes = parseInt(b, 10);
    if (mes > 12 && dia <= 12) {
      [dia, mes] = [mes, dia];
    }
    const ano = anoTexto.length === 2 ? 2000 + parseInt(anoTexto, 10) : parseInt(anoTexto, 10);
    return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  }
  return null;
}

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
  return parseValorReais(texto as string);
}

function enumOuNull(lista: { value: string; label: string }[], texto: string | undefined): string | null {
  if (ehVazio(texto)) return null;
  return labelParaValor(lista, texto as string);
}

async function executarEmLotes(statements: D1PreparedStatement[], tamanhoLote = 40): Promise<void> {
  for (let i = 0; i < statements.length; i += tamanhoLote) {
    await db().batch(statements.slice(i, i + tamanhoLote));
  }
}

export interface LinhaIgnoradaSite {
  linha: number;
  motivo: string;
}

export interface ResultadoImportacaoSites {
  inseridos: number;
  ignorados: LinhaIgnoradaSite[];
}

export async function processarImportacaoSitesXlsx(
  buffer: ArrayBuffer,
  usuarioId: number
): Promise<ResultadoImportacaoSites> {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const planilha = encontrarPlanilha(workbook);
  if (!planilha) {
    throw new Error('Não encontrei nenhuma aba no arquivo enviado.');
  }

  const linhas = XLSX.utils.sheet_to_json<Linha>(planilha, { raw: false, defval: '' }).map(normalizarChaves);

  const statements: D1PreparedStatement[] = [];
  const ignorados: LinhaIgnoradaSite[] = [];

  linhas.forEach((linha, indice) => {
    const numeroLinha = indice + 2; // +1 pelo cabeçalho, +1 por índice base 1
    const urlSite = (linha['URL do Site'] ?? '').trim();
    if (!urlSite) return; // linha em branco no fim do arquivo — não é um erro, só ignora silenciosamente

    const canal = labelParaValor(CANAIS_PROSPECCAO, linha['Canal Utilizado'] ?? '');
    const tipoContato = labelParaValor(TIPOS_CONTATO_PROSPECCAO, linha['Tipo de Contato'] ?? '');
    const status = labelParaValor(STATUS_PROSPECCAO, linha['Status Atual'] ?? '');
    const dataContatoTexto = (linha['Data do Contato (segunda-feira da semana)'] ?? '').trim();

    if (!canal) {
      ignorados.push({ linha: numeroLinha, motivo: `Canal Utilizado inválido: "${linha['Canal Utilizado'] ?? ''}".` });
      return;
    }
    if (!tipoContato) {
      ignorados.push({ linha: numeroLinha, motivo: `Tipo de Contato inválido: "${linha['Tipo de Contato'] ?? ''}".` });
      return;
    }
    if (!status) {
      ignorados.push({ linha: numeroLinha, motivo: `Status Atual inválido: "${linha['Status Atual'] ?? ''}".` });
      return;
    }
    if (!dataContatoTexto) {
      ignorados.push({ linha: numeroLinha, motivo: 'Data do Contato vazia.' });
      return;
    }

    const dataContatoParsed = parseData(dataContatoTexto);
    if (!dataContatoParsed) {
      ignorados.push({ linha: numeroLinha, motivo: `Data do Contato inválida: "${dataContatoTexto}".` });
      return;
    }
    // A coluna já deveria vir com a segunda-feira da semana; força para garantir
    // (mesma regra do CLI e da mesma forma que Pedidos/Ações reconstroem a semana).
    const dataContato = segundaFeiraDaSemana(dataContatoParsed);

    statements.push(
      db()
        .prepare(
          `INSERT INTO sites_prospectados
             (url_site, domain_rating, trafego_estimado, nicho, canal, tipo_contato, status, num_tentativas,
              data_contato, link_email, valor_solicitado_white_centavos, valor_solicitado_black_centavos,
              valor_fechado_white_centavos, valor_fechado_black_centavos, valor_fechado_insercao_centavos,
              aceita_insercao, aceita_pacote, administra_outros_sites, outros_sites_urls, dentro_tabela_precos,
              observacoes, criado_por)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          urlSite,
          inteiroOuNull(linha['DR']),
          limparTrafego(linha['Tráfego Estimado']),
          textoOuNull(linha['Nicho / Segmento']),
          canal,
          tipoContato,
          status,
          inteiroOuNull(linha['Nº de Tentativas']) ?? 1,
          dataContato,
          textoOuNull(linha['Link do E-mail']),
          dinheiroOuNull(linha['Valor Solicitado – White Hat (R$)']),
          dinheiroOuNull(linha['Valor Solicitado – Black Hat (R$)']),
          dinheiroOuNull(linha['Valor Fechado – White Hat (R$)']),
          dinheiroOuNull(linha['Valor Fechado – Black Hat (R$)']),
          dinheiroOuNull(linha['Valor Fechado – Inserção (R$)']),
          enumOuNull(OPCOES_TRI_ESTADO, linha['Aceita Inserção?']),
          enumOuNull(OPCOES_TRI_ESTADO, linha['Aceita Pacote?']),
          enumOuNull(OPCOES_TRI_ESTADO, linha['Adm. Outros Sites?']),
          textoOuNull(linha['Outros Sites (URLs)']),
          enumOuNull(OPCOES_SIM_NAO, linha['Dentro da tabela de preços?']),
          textoOuNull(linha['Observações']),
          usuarioId
        )
    );
  });

  await executarEmLotes(statements);

  return { inseridos: statements.length, ignorados };
}
