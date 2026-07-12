import * as XLSX from 'xlsx';
import { db } from './db';
import { CANAIS, CANAIS_COMERCIAIS, RESULTADOS_ACAO, STATUS_PEDIDO, TIPOS_ACAO } from './types';

type Linha = Record<string, string>;

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

function encontrarPlanilha(workbook: XLSX.WorkBook, nomesAceitos: string[]): XLSX.WorkSheet | null {
  const alvo = nomesAceitos.map(normalizarNomeAba);
  const nomeReal = workbook.SheetNames.find((n) => alvo.includes(normalizarNomeAba(n)));
  return nomeReal ? workbook.Sheets[nomeReal] : null;
}

function lerLinhas(planilha: XLSX.WorkSheet | null): Linha[] {
  if (!planilha) return [];
  const linhas = XLSX.utils.sheet_to_json<Linha>(planilha, { raw: false, defval: '' });
  return linhas.map(normalizarChaves);
}

function obterCabecalhos(planilha: XLSX.WorkSheet | null): string[] {
  if (!planilha) return [];
  const linhas = XLSX.utils.sheet_to_json<string[]>(planilha, { header: 1, raw: false, defval: '' });
  return (linhas[0] ?? []).map((h) => String(h ?? '').trim()).filter(Boolean);
}

async function executarEmLotes(statements: D1PreparedStatement[], tamanhoLote = 40): Promise<void> {
  for (let i = 0; i < statements.length; i += tamanhoLote) {
    await db().batch(statements.slice(i, i + tamanhoLote));
  }
}

export interface LinhaIgnorada {
  linha: number;
  motivo: string;
}

export interface ResultadoImportacao {
  planilhasEncontradas: string[];
  cabecalhosDetectados: Record<string, string[]>;
  clientesProcessados: number;
  pedidosInseridos: number;
  pedidosIgnorados: LinhaIgnorada[];
  acoesInseridas: number;
  acoesIgnoradas: LinhaIgnorada[];
}

export async function processarImportacaoXlsx(
  buffer: ArrayBuffer,
  usuarioId: number
): Promise<ResultadoImportacao> {
  const workbook = XLSX.read(buffer, { type: 'array' });

  const planClientes = encontrarPlanilha(workbook, ['Clientes']);
  const planPedidos = encontrarPlanilha(workbook, ['Pedidos']);
  const planAcoes = encontrarPlanilha(workbook, ['Ações Comerciais', 'Acoes Comerciais']);

  const planilhasEncontradas = [
    planClientes ? 'Clientes' : null,
    planPedidos ? 'Pedidos' : null,
    planAcoes ? 'Ações Comerciais' : null
  ].filter((x): x is string => x !== null);

  if (planilhasEncontradas.length === 0) {
    const nomesNoArquivo = workbook.SheetNames.map((n) => `"${n}"`).join(', ');
    throw new Error(
      `Nenhuma aba reconhecida. Espero abas chamadas "Clientes", "Pedidos" e/ou "Ações Comerciais" ` +
        `(sem diferenciar maiúsculas/minúsculas). O arquivo enviado tem estas abas: ${nomesNoArquivo}.`
    );
  }

  const cabecalhosDetectados: Record<string, string[]> = {};
  if (planClientes) cabecalhosDetectados['Clientes'] = obterCabecalhos(planClientes);
  if (planPedidos) cabecalhosDetectados['Pedidos'] = obterCabecalhos(planPedidos);
  if (planAcoes) cabecalhosDetectados['Ações Comerciais'] = obterCabecalhos(planAcoes);

  const linhasClientes = lerLinhas(planClientes);
  const linhasPedidos = lerLinhas(planPedidos);
  const linhasAcoes = lerLinhas(planAcoes);

  // 1) Garante que todo cliente citado em qualquer aba existe na tabela clientes.
  const nomesClientes = new Set<string>();
  const observacoesPorNome = new Map<string, string | null>();

  for (const linha of linhasClientes) {
    const nome = (linha['Cliente'] ?? '').trim();
    if (!nome) continue;
    nomesClientes.add(nome);
    observacoesPorNome.set(nome, linha['Observação']?.trim() || null);
  }
  for (const linha of linhasPedidos) {
    const nome = (linha['Cliente'] ?? '').trim();
    if (nome) nomesClientes.add(nome);
  }
  for (const linha of linhasAcoes) {
    const nome = (linha['Cliente / Prospect'] ?? '').trim();
    if (nome) nomesClientes.add(nome);
  }

  const inserirClientes = [...nomesClientes].map((nome) =>
    db()
      .prepare('INSERT INTO clientes (nome, observacao) VALUES (?, ?) ON CONFLICT(nome) DO NOTHING')
      .bind(nome, observacoesPorNome.get(nome) ?? null)
  );
  await executarEmLotes(inserirClientes);

  const { results: clientesRows } = await db()
    .prepare('SELECT id, nome FROM clientes')
    .all<{ id: number; nome: string }>();
  const mapaClientes = new Map(clientesRows.map((c) => [c.nome, c.id]));

  // 2) Pedidos
  const pedidosStatements: D1PreparedStatement[] = [];
  const pedidosIgnorados: LinhaIgnorada[] = [];

  linhasPedidos.forEach((linha, indice) => {
    const numeroLinha = indice + 2; // +1 pelo cabeçalho, +1 por índice base 1
    const nomeCliente = (linha['Cliente'] ?? '').trim();
    const clienteId = mapaClientes.get(nomeCliente);
    const canal = labelParaValor(CANAIS, linha['Canal de Origem'] ?? '');
    const status = labelParaValor(STATUS_PEDIDO, linha['Status do Pedido'] ?? '');
    const dataPedido = parseData(linha['Data do Pedido'] ?? '');
    const valorCentavos = parseValorReais(linha['Valor Total (R$)'] ?? '');

    if (!nomeCliente || !clienteId) {
      pedidosIgnorados.push({ linha: numeroLinha, motivo: `Cliente "${nomeCliente}" não encontrado.` });
      return;
    }
    if (!canal) {
      pedidosIgnorados.push({ linha: numeroLinha, motivo: `Canal de Origem inválido: "${linha['Canal de Origem']}".` });
      return;
    }
    if (!status) {
      pedidosIgnorados.push({ linha: numeroLinha, motivo: `Status do Pedido inválido: "${linha['Status do Pedido']}".` });
      return;
    }
    if (!dataPedido) {
      pedidosIgnorados.push({ linha: numeroLinha, motivo: `Data do Pedido inválida: "${linha['Data do Pedido']}".` });
      return;
    }
    if (valorCentavos === null || valorCentavos <= 0) {
      pedidosIgnorados.push({ linha: numeroLinha, motivo: `Valor Total inválido: "${linha['Valor Total (R$)']}".` });
      return;
    }

    const qtdLinks = parseInt(linha['Qtd. de Links'] || '1', 10) || 1;
    const prazoEntrega = parseData(linha['Prazo de Entrega'] ?? '');
    const linkDetalhe = (linha['Link da Planilha de Detalhe'] ?? '').trim() || null;

    pedidosStatements.push(
      db()
        .prepare(
          `INSERT INTO pedidos (cliente_id, canal, qtd_links, valor_centavos, data_pedido, prazo_entrega, status, link_detalhe, criado_por)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(clienteId, canal, qtdLinks, valorCentavos, dataPedido, prazoEntrega, status, linkDetalhe, usuarioId)
    );
  });

  await executarEmLotes(pedidosStatements);

  // 3) Ações Comerciais
  const acoesStatements: D1PreparedStatement[] = [];
  const acoesIgnoradas: LinhaIgnorada[] = [];

  linhasAcoes.forEach((linha, indice) => {
    const numeroLinha = indice + 2;
    const nomeCliente = (linha['Cliente / Prospect'] ?? '').trim();
    const clienteId = mapaClientes.get(nomeCliente);
    const canal = labelParaValor(CANAIS_COMERCIAIS, linha['Canal'] ?? '');
    const tipo = labelParaValor(TIPOS_ACAO, linha['Tipo de Ação'] ?? '');
    const resultado = labelParaValor(RESULTADOS_ACAO, linha['Resultado'] ?? '');

    if (!nomeCliente || !clienteId) {
      acoesIgnoradas.push({ linha: numeroLinha, motivo: `Cliente/Prospect "${nomeCliente}" não encontrado.` });
      return;
    }
    if (!canal) {
      acoesIgnoradas.push({ linha: numeroLinha, motivo: `Canal inválido: "${linha['Canal']}".` });
      return;
    }
    if (!tipo) {
      acoesIgnoradas.push({ linha: numeroLinha, motivo: `Tipo de Ação inválido: "${linha['Tipo de Ação']}".` });
      return;
    }
    if (!resultado) {
      acoesIgnoradas.push({ linha: numeroLinha, motivo: `Resultado inválido: "${linha['Resultado']}".` });
      return;
    }

    const dataAcao = parseData(linha['Semana (segunda)'] ?? '') ?? new Date().toISOString().slice(0, 10);
    const observacoes = (linha['Observações'] ?? '').trim() || null;

    acoesStatements.push(
      db()
        .prepare(
          `INSERT INTO acoes_comerciais (cliente_id, canal, tipo, resultado, observacoes, data_acao, criado_por)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(clienteId, canal, tipo, resultado, observacoes, dataAcao, usuarioId)
    );
  });

  await executarEmLotes(acoesStatements);

  return {
    planilhasEncontradas,
    cabecalhosDetectados,
    clientesProcessados: nomesClientes.size,
    pedidosInseridos: pedidosStatements.length,
    pedidosIgnorados,
    acoesInseridas: acoesStatements.length,
    acoesIgnoradas
  };
}
