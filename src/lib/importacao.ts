import * as XLSX from 'xlsx';
import { db } from './db';
import { CANAIS, CANAIS_COMERCIAIS, RESULTADOS_ACAO, STATUS_PEDIDO, TIPOS_ACAO } from './types';

type Linha = Record<string, string>;

export const CABECALHO_MODELO_PEDIDOS = [
  'Semana (segunda)',
  'Cliente',
  'Canal de Origem',
  'Qtd. de Links',
  'Valor Total (R$)',
  'Data do Pedido',
  'Prazo de Entrega',
  'Status do Pedido',
  'Link da Planilha de Detalhe',
  'Observação'
];

export const CABECALHO_MODELO_ACOES = ['Semana (segunda)', 'Cliente / Prospect', 'Canal', 'Tipo de Ação', 'Resultado', 'Observações'];

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
    // O separador decimal é o que aparece por último; o outro é milhar e é descartado.
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
    // Quando o "mês" extraído é >12, os campos estão trocados (formato MM/DD).
    if (mes > 12 && dia <= 12) {
      [dia, mes] = [mes, dia];
    }
    const ano = anoTexto.length === 2 ? 2000 + parseInt(anoTexto, 10) : parseInt(anoTexto, 10);
    return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  }
  return null;
}

function normalizarChaves(linha: Linha): Linha {
  const normalizada: Linha = {};
  for (const [chave, valor] of Object.entries(linha)) {
    normalizada[chave.trim()] = typeof valor === 'string' ? valor : String(valor ?? '');
  }
  return normalizada;
}

function normalizarNomeAba(nome: string): string {
  // Remove emojis/símbolos (ex: "📦 Pedidos" -> "pedidos"), mantendo só letras e espaços.
  return nome
    .replace(/[^\p{L}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function encontrarPlanilha(workbook: XLSX.WorkBook, nomesAceitos: string[]): XLSX.WorkSheet {
  const alvo = nomesAceitos.map(normalizarNomeAba);
  const nomeReal = workbook.SheetNames.find((n) => alvo.includes(normalizarNomeAba(n)));
  const nome = nomeReal ?? workbook.SheetNames[0];
  return workbook.Sheets[nome];
}

function lerLinhas(planilha: XLSX.WorkSheet): Linha[] {
  const linhas = XLSX.utils.sheet_to_json<Linha>(planilha, { raw: false, defval: '' });
  return linhas.map(normalizarChaves);
}

async function executarEmLotes(statements: D1PreparedStatement[], tamanhoLote = 40): Promise<void> {
  for (let i = 0; i < statements.length; i += tamanhoLote) {
    await db().batch(statements.slice(i, i + tamanhoLote));
  }
}

async function garantirClientes(nomes: Set<string>): Promise<Map<string, number>> {
  const inserirClientes = [...nomes].map((nome) =>
    db().prepare('INSERT INTO clientes (nome, observacao) VALUES (?, NULL) ON CONFLICT(nome) DO NOTHING').bind(nome)
  );
  await executarEmLotes(inserirClientes);

  const { results } = await db().prepare('SELECT id, nome FROM clientes').all<{ id: number; nome: string }>();
  return new Map(results.map((c) => [c.nome, c.id]));
}

export interface LinhaIgnorada {
  linha: number;
  motivo: string;
}

export interface ResultadoImportacaoPedidos {
  inseridos: number;
  ignorados: LinhaIgnorada[];
}

export interface ResultadoImportacaoAcoes {
  inseridos: number;
  ignorados: LinhaIgnorada[];
}

export async function processarImportacaoPedidosXlsx(
  buffer: ArrayBuffer,
  usuarioId: number
): Promise<ResultadoImportacaoPedidos> {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const planilha = encontrarPlanilha(workbook, ['Pedidos']);
  if (!planilha) {
    throw new Error('Não encontrei nenhuma aba no arquivo enviado.');
  }
  const linhas = lerLinhas(planilha);

  const nomesClientes = new Set<string>();
  for (const linha of linhas) {
    const nome = (linha['Cliente'] ?? '').trim();
    if (nome) nomesClientes.add(nome);
  }
  const mapaClientes = await garantirClientes(nomesClientes);

  const statements: D1PreparedStatement[] = [];
  const ignorados: LinhaIgnorada[] = [];

  linhas.forEach((linha, indice) => {
    const numeroLinha = indice + 2; // +1 pelo cabeçalho, +1 por índice base 1
    const nomeCliente = (linha['Cliente'] ?? '').trim();
    if (!nomeCliente) return; // linha em branco no fim do arquivo — não é um erro, só ignora silenciosamente

    const clienteId = mapaClientes.get(nomeCliente);
    const canal = labelParaValor(CANAIS, linha['Canal de Origem'] ?? '');
    const status = labelParaValor(STATUS_PEDIDO, linha['Status do Pedido'] ?? '');
    const dataPedido = parseData(linha['Data do Pedido'] ?? '');
    const valorCentavos = parseValorReais(linha['Valor Total (R$)'] ?? '');

    if (!clienteId) {
      ignorados.push({ linha: numeroLinha, motivo: `Cliente "${nomeCliente}" não encontrado.` });
      return;
    }
    if (!canal) {
      ignorados.push({ linha: numeroLinha, motivo: `Canal de Origem inválido: "${linha['Canal de Origem'] ?? ''}".` });
      return;
    }
    if (!status) {
      ignorados.push({ linha: numeroLinha, motivo: `Status do Pedido inválido: "${linha['Status do Pedido'] ?? ''}".` });
      return;
    }
    if (!dataPedido) {
      ignorados.push({ linha: numeroLinha, motivo: `Data do Pedido inválida: "${linha['Data do Pedido'] ?? ''}".` });
      return;
    }
    if (valorCentavos === null || valorCentavos <= 0) {
      ignorados.push({ linha: numeroLinha, motivo: `Valor Total inválido: "${linha['Valor Total (R$)'] ?? ''}".` });
      return;
    }

    const qtdLinks = parseInt(linha['Qtd. de Links'] || '1', 10) || 1;
    const prazoEntrega = parseData(linha['Prazo de Entrega'] ?? '');
    const linkDetalhe = (linha['Link da Planilha de Detalhe'] ?? '').trim() || null;
    const observacao = (linha['Observação'] ?? '').trim() || null;

    statements.push(
      db()
        .prepare(
          `INSERT INTO pedidos (cliente_id, canal, qtd_links, valor_centavos, data_pedido, prazo_entrega, status, link_detalhe, observacao, criado_por)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(clienteId, canal, qtdLinks, valorCentavos, dataPedido, prazoEntrega, status, linkDetalhe, observacao, usuarioId)
    );
  });

  await executarEmLotes(statements);

  return { inseridos: statements.length, ignorados };
}

export async function processarImportacaoAcoesXlsx(
  buffer: ArrayBuffer,
  usuarioId: number
): Promise<ResultadoImportacaoAcoes> {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const planilha = encontrarPlanilha(workbook, ['Ações Comerciais', 'Acoes Comerciais']);
  if (!planilha) {
    throw new Error('Não encontrei nenhuma aba no arquivo enviado.');
  }
  const linhas = lerLinhas(planilha);

  const nomesClientes = new Set<string>();
  for (const linha of linhas) {
    const nome = (linha['Cliente / Prospect'] ?? '').trim();
    if (nome) nomesClientes.add(nome);
  }
  const mapaClientes = await garantirClientes(nomesClientes);

  const statements: D1PreparedStatement[] = [];
  const ignorados: LinhaIgnorada[] = [];

  linhas.forEach((linha, indice) => {
    const numeroLinha = indice + 2;
    const nomeCliente = (linha['Cliente / Prospect'] ?? '').trim();
    if (!nomeCliente) return; // linha em branco no fim do arquivo — não é um erro, só ignora silenciosamente

    const clienteId = mapaClientes.get(nomeCliente);
    const canal = labelParaValor(CANAIS_COMERCIAIS, linha['Canal'] ?? '');
    const tipo = labelParaValor(TIPOS_ACAO, linha['Tipo de Ação'] ?? '');
    const resultado = labelParaValor(RESULTADOS_ACAO, linha['Resultado'] ?? '');

    if (!clienteId) {
      ignorados.push({ linha: numeroLinha, motivo: `Cliente/Prospect "${nomeCliente}" não encontrado.` });
      return;
    }
    if (!canal) {
      ignorados.push({ linha: numeroLinha, motivo: `Canal inválido: "${linha['Canal'] ?? ''}".` });
      return;
    }
    if (!tipo) {
      ignorados.push({ linha: numeroLinha, motivo: `Tipo de Ação inválido: "${linha['Tipo de Ação'] ?? ''}".` });
      return;
    }
    if (!resultado) {
      ignorados.push({ linha: numeroLinha, motivo: `Resultado inválido: "${linha['Resultado'] ?? ''}".` });
      return;
    }

    const dataAcao = parseData(linha['Semana (segunda)'] ?? '') ?? new Date().toISOString().slice(0, 10);
    const observacoes = (linha['Observações'] ?? '').trim() || null;

    statements.push(
      db()
        .prepare(
          `INSERT INTO acoes_comerciais (cliente_id, canal, tipo, resultado, observacoes, data_acao, criado_por)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(clienteId, canal, tipo, resultado, observacoes, dataAcao, usuarioId)
    );
  });

  await executarEmLotes(statements);

  return { inseridos: statements.length, ignorados };
}
