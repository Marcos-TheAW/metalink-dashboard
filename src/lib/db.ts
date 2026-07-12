import { env } from 'cloudflare:workers';
import type {
  AcaoComercial,
  Cliente,
  ClienteStatus,
  KpisGerais,
  Pedido,
  Usuario
} from './types';

export function db(): D1Database {
  return env.DB;
}

// ---------- Usuários ----------

export async function getUsuarioPorEmail(email: string): Promise<Usuario | null> {
  const row = await db()
    .prepare('SELECT * FROM usuarios WHERE email = ? AND ativo = 1')
    .bind(email)
    .first<Usuario>();
  return row ?? null;
}

export async function listUsuariosAtivos(): Promise<Usuario[]> {
  const { results } = await db()
    .prepare('SELECT * FROM usuarios WHERE ativo = 1 ORDER BY nome')
    .all<Usuario>();
  return results;
}

// ---------- Clientes ----------

export async function listClientes(): Promise<Cliente[]> {
  const { results } = await db().prepare('SELECT * FROM clientes ORDER BY nome').all<Cliente>();
  return results;
}

export async function getCliente(id: number): Promise<Cliente | null> {
  const row = await db().prepare('SELECT * FROM clientes WHERE id = ?').bind(id).first<Cliente>();
  return row ?? null;
}

export async function criarCliente(nome: string, observacao: string | null): Promise<number> {
  const result = await db()
    .prepare('INSERT INTO clientes (nome, observacao) VALUES (?, ?)')
    .bind(nome, observacao)
    .run();
  return result.meta.last_row_id as number;
}

export async function listClientesStatus(): Promise<ClienteStatus[]> {
  const { results } = await db()
    .prepare('SELECT * FROM v_clientes_status ORDER BY nome')
    .all<ClienteStatus>();
  return results;
}

// ---------- KPIs / Dashboard ----------

export async function getKpisGerais(): Promise<KpisGerais> {
  const row = await db().prepare('SELECT * FROM v_kpis_gerais').first<KpisGerais>();
  return (
    row ?? {
      total_pedidos: 0,
      receita_total_centavos: 0,
      ticket_medio_centavos: 0,
      total_acoes: 0,
      acoes_convertidas: 0,
      taxa_conversao: 0,
      receita_em_risco_centavos: 0
    }
  );
}

export interface KpiPorCanal {
  canal: string;
  total_pedidos: number;
  receita_centavos: number;
}

export async function getKpisPorCanal(): Promise<KpiPorCanal[]> {
  const { results } = await db()
    .prepare(
      `SELECT canal, COUNT(*) AS total_pedidos, COALESCE(SUM(valor_centavos), 0) AS receita_centavos
       FROM pedidos GROUP BY canal ORDER BY receita_centavos DESC`
    )
    .all<KpiPorCanal>();
  return results;
}

export interface KpiPorMes {
  mes: string;
  total_pedidos: number;
  receita_centavos: number;
}

export async function getKpisPorMes(): Promise<KpiPorMes[]> {
  const { results } = await db()
    .prepare(
      `SELECT strftime('%Y-%m', data_pedido) AS mes,
              COUNT(*) AS total_pedidos,
              COALESCE(SUM(valor_centavos), 0) AS receita_centavos
       FROM pedidos
       GROUP BY mes
       ORDER BY mes`
    )
    .all<KpiPorMes>();
  return results;
}

export interface RetencaoClientes {
  status_relacionamento: string;
  total: number;
}

export async function getRetencaoClientes(): Promise<RetencaoClientes[]> {
  const { results } = await db()
    .prepare(
      `SELECT status_relacionamento, COUNT(*) AS total
       FROM v_clientes_status
       GROUP BY status_relacionamento`
    )
    .all<RetencaoClientes>();
  return results;
}

export interface ExecucaoComercial {
  tipo: string;
  resultado: string;
  total: number;
}

export async function getExecucaoComercial(): Promise<ExecucaoComercial[]> {
  const { results } = await db()
    .prepare(
      `SELECT tipo, resultado, COUNT(*) AS total
       FROM acoes_comerciais
       GROUP BY tipo, resultado
       ORDER BY tipo`
    )
    .all<ExecucaoComercial>();
  return results;
}

// ---------- Histórico ----------

async function registrarHistorico(
  tabela: string,
  registroId: number,
  usuarioId: number,
  antes: Record<string, unknown>,
  depois: Record<string, unknown>
): Promise<void> {
  const statements: D1PreparedStatement[] = [];
  for (const campo of Object.keys(depois)) {
    const valorAnterior = antes[campo] ?? null;
    const valorNovo = depois[campo] ?? null;
    if (String(valorAnterior ?? '') === String(valorNovo ?? '')) continue;
    statements.push(
      db()
        .prepare(
          `INSERT INTO historico_alteracoes (tabela, registro_id, usuario_id, campo, valor_anterior, valor_novo)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(
          tabela,
          registroId,
          usuarioId,
          campo,
          valorAnterior === null ? null : String(valorAnterior),
          valorNovo === null ? null : String(valorNovo)
        )
    );
  }
  if (statements.length > 0) {
    await db().batch(statements);
  }
}

// ---------- Pedidos ----------

export interface FiltrosPedidos {
  status?: string;
  canal?: string;
  cliente_id?: number;
}

export interface PedidoComCliente extends Pedido {
  cliente_nome: string;
}

export async function listPedidos(filtros: FiltrosPedidos = {}): Promise<PedidoComCliente[]> {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filtros.status) {
    clauses.push('p.status = ?');
    params.push(filtros.status);
  }
  if (filtros.canal) {
    clauses.push('p.canal = ?');
    params.push(filtros.canal);
  }
  if (filtros.cliente_id) {
    clauses.push('p.cliente_id = ?');
    params.push(filtros.cliente_id);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const { results } = await db()
    .prepare(
      `SELECT p.*, c.nome AS cliente_nome
       FROM pedidos p
       JOIN clientes c ON c.id = p.cliente_id
       ${where}
       ORDER BY p.data_pedido DESC, p.id DESC`
    )
    .bind(...params)
    .all<PedidoComCliente>();
  return results;
}

export async function getPedido(id: number): Promise<Pedido | null> {
  const row = await db().prepare('SELECT * FROM pedidos WHERE id = ?').bind(id).first<Pedido>();
  return row ?? null;
}

export interface PedidoInput {
  cliente_id: number;
  canal: string;
  qtd_links: number;
  valor_centavos: number;
  data_pedido: string;
  prazo_entrega: string | null;
  status: string;
  link_detalhe: string | null;
  responsavel_id: number | null;
}

export async function criarPedido(input: PedidoInput, usuarioId: number): Promise<number> {
  const result = await db()
    .prepare(
      `INSERT INTO pedidos
         (cliente_id, canal, qtd_links, valor_centavos, data_pedido, prazo_entrega, status, link_detalhe, responsavel_id, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      input.cliente_id,
      input.canal,
      input.qtd_links,
      input.valor_centavos,
      input.data_pedido,
      input.prazo_entrega,
      input.status,
      input.link_detalhe,
      input.responsavel_id,
      usuarioId
    )
    .run();
  return result.meta.last_row_id as number;
}

export async function atualizarPedido(
  id: number,
  input: PedidoInput,
  usuarioId: number
): Promise<void> {
  const atual = await getPedido(id);
  if (!atual) throw new Error('Pedido não encontrado');

  await db()
    .prepare(
      `UPDATE pedidos
          SET cliente_id = ?, canal = ?, qtd_links = ?, valor_centavos = ?, data_pedido = ?,
              prazo_entrega = ?, status = ?, link_detalhe = ?, responsavel_id = ?, atualizado_em = datetime('now')
        WHERE id = ?`
    )
    .bind(
      input.cliente_id,
      input.canal,
      input.qtd_links,
      input.valor_centavos,
      input.data_pedido,
      input.prazo_entrega,
      input.status,
      input.link_detalhe,
      input.responsavel_id,
      id
    )
    .run();

  await registrarHistorico(
    'pedidos',
    id,
    usuarioId,
    atual as unknown as Record<string, unknown>,
    input as unknown as Record<string, unknown>
  );
}

// ---------- Ações Comerciais ----------

export interface FiltrosAcoes {
  tipo?: string;
  resultado?: string;
  cliente_id?: number;
}

export interface AcaoComComCliente extends AcaoComercial {
  cliente_nome: string;
}

export async function listAcoes(filtros: FiltrosAcoes = {}): Promise<AcaoComComCliente[]> {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filtros.tipo) {
    clauses.push('a.tipo = ?');
    params.push(filtros.tipo);
  }
  if (filtros.resultado) {
    clauses.push('a.resultado = ?');
    params.push(filtros.resultado);
  }
  if (filtros.cliente_id) {
    clauses.push('a.cliente_id = ?');
    params.push(filtros.cliente_id);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const { results } = await db()
    .prepare(
      `SELECT a.*, c.nome AS cliente_nome
       FROM acoes_comerciais a
       JOIN clientes c ON c.id = a.cliente_id
       ${where}
       ORDER BY a.data_acao DESC, a.id DESC`
    )
    .bind(...params)
    .all<AcaoComComCliente>();
  return results;
}

export async function getAcao(id: number): Promise<AcaoComercial | null> {
  const row = await db()
    .prepare('SELECT * FROM acoes_comerciais WHERE id = ?')
    .bind(id)
    .first<AcaoComercial>();
  return row ?? null;
}

export interface AcaoInput {
  cliente_id: number;
  canal: string;
  tipo: string;
  resultado: string;
  observacoes: string | null;
  data_acao: string;
  responsavel_id: number | null;
}

export async function criarAcao(input: AcaoInput, usuarioId: number): Promise<number> {
  const result = await db()
    .prepare(
      `INSERT INTO acoes_comerciais
         (cliente_id, canal, tipo, resultado, observacoes, data_acao, responsavel_id, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      input.cliente_id,
      input.canal,
      input.tipo,
      input.resultado,
      input.observacoes,
      input.data_acao,
      input.responsavel_id,
      usuarioId
    )
    .run();
  return result.meta.last_row_id as number;
}

export async function atualizarAcao(
  id: number,
  input: AcaoInput,
  usuarioId: number
): Promise<void> {
  const atual = await getAcao(id);
  if (!atual) throw new Error('Ação comercial não encontrada');

  await db()
    .prepare(
      `UPDATE acoes_comerciais
          SET cliente_id = ?, canal = ?, tipo = ?, resultado = ?, observacoes = ?, data_acao = ?,
              responsavel_id = ?, atualizado_em = datetime('now')
        WHERE id = ?`
    )
    .bind(
      input.cliente_id,
      input.canal,
      input.tipo,
      input.resultado,
      input.observacoes,
      input.data_acao,
      input.responsavel_id,
      id
    )
    .run();

  await registrarHistorico(
    'acoes_comerciais',
    id,
    usuarioId,
    atual as unknown as Record<string, unknown>,
    input as unknown as Record<string, unknown>
  );
}

export async function listHistorico(tabela: string, registroId: number) {
  const { results } = await db()
    .prepare(
      `SELECT h.*, u.nome AS usuario_nome
       FROM historico_alteracoes h
       LEFT JOIN usuarios u ON u.id = h.usuario_id
       WHERE h.tabela = ? AND h.registro_id = ?
       ORDER BY h.criado_em DESC`
    )
    .bind(tabela, registroId)
    .all();
  return results;
}
