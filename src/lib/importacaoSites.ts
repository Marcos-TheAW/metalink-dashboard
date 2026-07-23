import { db } from './db';
import {
  CANAIS_PROSPECCAO,
  OPCOES_SIM_NAO,
  OPCOES_TRI_ESTADO,
  STATUS_PROSPECCAO,
  TIPOS_CONTATO_PROSPECCAO,
  segundaFeiraDaSemana
} from './types';

// Parsing é posicional (não por nome de cabeçalho): exports de CSV do Google Sheets
// frequentemente corrompem acentos/travessões dependendo do encoding de saída, mas a
// ORDEM das colunas é estável. Mesmo padrão de scripts/importar-registro-sites.ts (CLI) —
// duplicado aqui de propósito, não importado, porque aquele script roda em Node fora do
// Workers runtime (usa node:fs) e este módulo roda dentro do Worker.

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
} as const;

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

function parseCsv(conteudo: string): string[][] {
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

export async function processarImportacaoSitesCsv(
  conteudo: string,
  usuarioId: number
): Promise<ResultadoImportacaoSites> {
  const linhas = parseCsv(conteudo);
  const indiceCabecalho = linhas.findIndex((l) => (l[0] ?? '').trim() === 'URL do Site');
  if (indiceCabecalho === -1) {
    throw new Error(
      'Cabeçalho "URL do Site" não encontrado na primeira coluna do CSV. Use o modelo disponibilizado nesta página.'
    );
  }
  const linhasDados = linhas.slice(indiceCabecalho + 1);

  const statements: D1PreparedStatement[] = [];
  const ignorados: LinhaIgnoradaSite[] = [];

  linhasDados.forEach((linha, indice) => {
    const numeroLinha = indiceCabecalho + indice + 2; // posição real no arquivo (1-based + cabeçalho)
    const urlSite = (linha[IDX.url] ?? '').trim();
    if (!urlSite) return; // linha em branco no fim do arquivo — não é um erro, só ignora silenciosamente

    const canal = labelParaValor(CANAIS_PROSPECCAO, linha[IDX.canal] ?? '');
    const tipoContato = labelParaValor(TIPOS_CONTATO_PROSPECCAO, linha[IDX.tipoContato] ?? '');
    const status = labelParaValor(STATUS_PROSPECCAO, linha[IDX.status] ?? '');
    const dataContatoTexto = (linha[IDX.data] ?? '').trim();

    if (!canal) {
      ignorados.push({ linha: numeroLinha, motivo: `Canal Utilizado inválido: "${linha[IDX.canal] ?? ''}".` });
      return;
    }
    if (!tipoContato) {
      ignorados.push({ linha: numeroLinha, motivo: `Tipo de Contato inválido: "${linha[IDX.tipoContato] ?? ''}".` });
      return;
    }
    if (!status) {
      ignorados.push({ linha: numeroLinha, motivo: `Status Atual inválido: "${linha[IDX.status] ?? ''}".` });
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
          inteiroOuNull(linha[IDX.dr]),
          limparTrafego(linha[IDX.trafego]),
          textoOuNull(linha[IDX.nicho]),
          canal,
          tipoContato,
          status,
          inteiroOuNull(linha[IDX.tentativas]) ?? 1,
          dataContato,
          textoOuNull(linha[IDX.linkEmail]),
          dinheiroOuNull(linha[IDX.valorSolicitadoWhite]),
          dinheiroOuNull(linha[IDX.valorSolicitadoBlack]),
          dinheiroOuNull(linha[IDX.valorFechadoWhite]),
          dinheiroOuNull(linha[IDX.valorFechadoBlack]),
          dinheiroOuNull(linha[IDX.valorFechadoInsercao]),
          enumOuNull(OPCOES_TRI_ESTADO, linha[IDX.aceitaInsercao]),
          enumOuNull(OPCOES_TRI_ESTADO, linha[IDX.aceitaPacote]),
          enumOuNull(OPCOES_TRI_ESTADO, linha[IDX.administraOutrosSites]),
          textoOuNull(linha[IDX.outrosSitesUrls]),
          enumOuNull(OPCOES_SIM_NAO, linha[IDX.dentroTabelaPrecos]),
          textoOuNull(linha[IDX.observacoes]),
          usuarioId
        )
    );
  });

  await executarEmLotes(statements);

  return { inseridos: statements.length, ignorados };
}
