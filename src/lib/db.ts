import { env } from 'cloudflare:workers';
import type {
  AcaoComercial,
  Cliente,
  ClienteStatus,
  KpisGerais,
  Papel,
  Pedido,
  SiteProspectado,
  TabelaPrecoFaixa,
  TabelaPrecoRedFlag,
  Usuario,
  UsuarioCredenciais
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

export async function getUsuarioPorId(id: number): Promise<Usuario | null> {
  const row = await db().prepare('SELECT * FROM usuarios WHERE id = ? AND ativo = 1').bind(id).first<Usuario>();
  return row ?? null;
}

export async function getCredenciaisPorEmail(email: string): Promise<UsuarioCredenciais | null> {
  const row = await db()
    .prepare('SELECT * FROM usuarios WHERE email = ?')
    .bind(email)
    .first<UsuarioCredenciais>();
  return row ?? null;
}

export async function getCredenciaisPorId(id: number): Promise<UsuarioCredenciais | null> {
  const row = await db().prepare('SELECT * FROM usuarios WHERE id = ?').bind(id).first<UsuarioCredenciais>();
  return row ?? null;
}

export async function registrarTentativaFalha(id: number): Promise<void> {
  await db()
    .prepare(
      `UPDATE usuarios
          SET tentativas_falhas = tentativas_falhas + 1,
              bloqueado_ate = CASE WHEN tentativas_falhas + 1 >= 5 THEN datetime('now', '+15 minutes') ELSE bloqueado_ate END
        WHERE id = ?`
    )
    .bind(id)
    .run();
}

export async function resetarTentativasFalha(id: number): Promise<void> {
  await db()
    .prepare(`UPDATE usuarios SET tentativas_falhas = 0, bloqueado_ate = NULL WHERE id = ?`)
    .bind(id)
    .run();
}

export async function definirSenha(id: number, hash: string, salt: string): Promise<void> {
  await db()
    .prepare(
      `UPDATE usuarios SET senha_hash = ?, senha_salt = ?, tentativas_falhas = 0, bloqueado_ate = NULL WHERE id = ?`
    )
    .bind(hash, salt, id)
    .run();
}

export async function listUsuariosAtivos(): Promise<Usuario[]> {
  const { results } = await db()
    .prepare('SELECT * FROM usuarios WHERE ativo = 1 ORDER BY nome')
    .all<Usuario>();
  return results;
}

export async function listUsuarios(): Promise<Usuario[]> {
  const { results } = await db().prepare('SELECT * FROM usuarios ORDER BY nome').all<Usuario>();
  return results;
}

export async function criarUsuario(
  email: string,
  nome: string,
  papel: Papel,
  senhaHash: string,
  senhaSalt: string
): Promise<number> {
  const result = await db()
    .prepare('INSERT INTO usuarios (email, nome, papel, senha_hash, senha_salt) VALUES (?, ?, ?, ?, ?)')
    .bind(email.trim().toLowerCase(), nome, papel, senhaHash, senhaSalt)
    .run();
  return result.meta.last_row_id as number;
}

export async function atualizarUsuario(id: number, papel: Papel, ativo: boolean): Promise<void> {
  await db()
    .prepare('UPDATE usuarios SET papel = ?, ativo = ? WHERE id = ?')
    .bind(papel, ativo ? 1 : 0, id)
    .run();
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

export async function atualizarCliente(
  id: number,
  nome: string,
  observacao: string | null,
  usuarioId: number
): Promise<void> {
  const atual = await getCliente(id);
  if (!atual) throw new Error('Cliente não encontrado');

  await db().prepare('UPDATE clientes SET nome = ?, observacao = ? WHERE id = ?').bind(nome, observacao, id).run();

  await registrarHistorico(
    'clientes',
    id,
    usuarioId,
    atual as unknown as Record<string, unknown>,
    { nome, observacao } as unknown as Record<string, unknown>
  );
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
  total_links: number;
  receita_centavos: number;
  ticket_medio_centavos: number;
}

export async function getKpisPorMes(): Promise<KpiPorMes[]> {
  const { results } = await db()
    .prepare(
      // O mês de um pedido é o mês da segunda-feira da sua semana (não o dia exato do
      // pedido) — assim uma semana que atravessa a virada do mês fica inteira num só mês,
      // em vez de picotada entre os dois.
      `SELECT strftime('%Y-%m', date(data_pedido, '-' || ((CAST(strftime('%w', data_pedido) AS INTEGER) + 6) % 7) || ' days')) AS mes,
              COUNT(*) AS total_pedidos,
              COALESCE(SUM(qtd_links), 0) AS total_links,
              COALESCE(SUM(valor_centavos), 0) AS receita_centavos,
              CASE WHEN COUNT(*) = 0 THEN 0 ELSE CAST(SUM(valor_centavos) AS REAL) / COUNT(*) END AS ticket_medio_centavos
       FROM pedidos
       GROUP BY mes
       ORDER BY mes`
    )
    .all<KpiPorMes>();
  return results;
}

export interface ExecucaoVendas {
  total_pedidos: number;
  total_links: number;
  total_receita_centavos: number;
  ultima_semana_pedidos: number;
  ultima_semana_links: number;
  ultima_semana_receita_centavos: number;
  ultima_semana_inicio: string;
  ultima_semana_fim: string;
  semanas_decorridas: number;
}

export async function getExecucaoVendas(): Promise<ExecucaoVendas> {
  const row = await db().prepare('SELECT * FROM v_execucao_vendas').first<ExecucaoVendas>();
  return (
    row ?? {
      total_pedidos: 0,
      total_links: 0,
      total_receita_centavos: 0,
      ultima_semana_pedidos: 0,
      ultima_semana_links: 0,
      ultima_semana_receita_centavos: 0,
      ultima_semana_inicio: '',
      ultima_semana_fim: '',
      semanas_decorridas: 0
    }
  );
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
  semana?: string;
  qtdLinksMin?: number;
  qtdLinksMax?: number;
  valorMinCentavos?: number;
  valorMaxCentavos?: number;
  dataInicio?: string;
  dataFim?: string;
  prazoInicio?: string;
  prazoFim?: string;
}

export interface PedidoComCliente extends Pedido {
  cliente_nome: string;
}

const SEGUNDA_FEIRA_SQL = (coluna: string) =>
  `date(${coluna}, '-' || ((CAST(strftime('%w', ${coluna}) AS INTEGER) + 6) % 7) || ' days')`;

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
  if (filtros.semana) {
    clauses.push(`${SEGUNDA_FEIRA_SQL('p.data_pedido')} = ?`);
    params.push(filtros.semana);
  }
  if (filtros.qtdLinksMin !== undefined) {
    clauses.push('p.qtd_links >= ?');
    params.push(filtros.qtdLinksMin);
  }
  if (filtros.qtdLinksMax !== undefined) {
    clauses.push('p.qtd_links <= ?');
    params.push(filtros.qtdLinksMax);
  }
  if (filtros.valorMinCentavos !== undefined) {
    clauses.push('p.valor_centavos >= ?');
    params.push(filtros.valorMinCentavos);
  }
  if (filtros.valorMaxCentavos !== undefined) {
    clauses.push('p.valor_centavos <= ?');
    params.push(filtros.valorMaxCentavos);
  }
  if (filtros.dataInicio) {
    clauses.push('p.data_pedido >= ?');
    params.push(filtros.dataInicio);
  }
  if (filtros.dataFim) {
    clauses.push('p.data_pedido <= ?');
    params.push(filtros.dataFim);
  }
  if (filtros.prazoInicio) {
    clauses.push('p.prazo_entrega >= ?');
    params.push(filtros.prazoInicio);
  }
  if (filtros.prazoFim) {
    clauses.push('p.prazo_entrega <= ?');
    params.push(filtros.prazoFim);
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

export async function listSemanasPedidos(): Promise<string[]> {
  const { results } = await db()
    .prepare(
      `SELECT DISTINCT ${SEGUNDA_FEIRA_SQL('data_pedido')} AS semana
       FROM pedidos
       ORDER BY semana DESC`
    )
    .all<{ semana: string }>();
  return results.map((r) => r.semana);
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
  observacao: string | null;
  responsavel_id: number | null;
}

export async function criarPedido(input: PedidoInput, usuarioId: number): Promise<number> {
  const result = await db()
    .prepare(
      `INSERT INTO pedidos
         (cliente_id, canal, qtd_links, valor_centavos, data_pedido, prazo_entrega, status, link_detalhe, observacao, responsavel_id, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      input.observacao,
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
              prazo_entrega = ?, status = ?, link_detalhe = ?, observacao = ?, responsavel_id = ?, atualizado_em = datetime('now')
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
      input.observacao,
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

export async function deletarPedido(id: number): Promise<void> {
  await db().prepare('DELETE FROM pedidos WHERE id = ?').bind(id).run();
}

// ---------- Ações Comerciais ----------

export interface FiltrosAcoes {
  tipo?: string;
  resultado?: string;
  canal?: string;
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
  if (filtros.canal) {
    clauses.push('a.canal = ?');
    params.push(filtros.canal);
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

// ---------- Prospecção de Sites ----------

export interface FiltrosSitesProspectados {
  status?: string;
  canal?: string;
  nicho?: string;
}

export async function listSitesProspectados(filtros: FiltrosSitesProspectados = {}): Promise<SiteProspectado[]> {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filtros.status) {
    clauses.push('status = ?');
    params.push(filtros.status);
  }
  if (filtros.canal) {
    clauses.push('canal = ?');
    params.push(filtros.canal);
  }
  if (filtros.nicho) {
    clauses.push('nicho LIKE ?');
    params.push(`%${filtros.nicho}%`);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const { results } = await db()
    .prepare(`SELECT * FROM sites_prospectados ${where} ORDER BY data_contato DESC, id DESC`)
    .bind(...params)
    .all<SiteProspectado>();
  return results;
}

export async function getSiteProspectado(id: number): Promise<SiteProspectado | null> {
  const row = await db().prepare('SELECT * FROM sites_prospectados WHERE id = ?').bind(id).first<SiteProspectado>();
  return row ?? null;
}

export interface SiteProspectadoInput {
  url_site: string;
  domain_rating: number | null;
  trafego_estimado: number | null;
  nicho: string | null;
  canal: string;
  tipo_contato: string;
  status: string;
  num_tentativas: number;
  data_contato: string;
  link_email: string | null;
  valor_solicitado_white_centavos: number | null;
  valor_solicitado_black_centavos: number | null;
  valor_fechado_white_centavos: number | null;
  valor_fechado_black_centavos: number | null;
  valor_fechado_insercao_centavos: number | null;
  aceita_insercao: string | null;
  aceita_pacote: string | null;
  administra_outros_sites: string | null;
  outros_sites_urls: string | null;
  dentro_tabela_precos: string | null;
  observacoes: string | null;
  responsavel_id: number | null;
}

export async function criarSiteProspectado(input: SiteProspectadoInput, usuarioId: number): Promise<number> {
  const result = await db()
    .prepare(
      `INSERT INTO sites_prospectados
         (url_site, domain_rating, trafego_estimado, nicho, canal, tipo_contato, status, num_tentativas,
          data_contato, link_email, valor_solicitado_white_centavos, valor_solicitado_black_centavos,
          valor_fechado_white_centavos, valor_fechado_black_centavos, valor_fechado_insercao_centavos,
          aceita_insercao, aceita_pacote, administra_outros_sites, outros_sites_urls, dentro_tabela_precos,
          observacoes, responsavel_id, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      input.url_site,
      input.domain_rating,
      input.trafego_estimado,
      input.nicho,
      input.canal,
      input.tipo_contato,
      input.status,
      input.num_tentativas,
      input.data_contato,
      input.link_email,
      input.valor_solicitado_white_centavos,
      input.valor_solicitado_black_centavos,
      input.valor_fechado_white_centavos,
      input.valor_fechado_black_centavos,
      input.valor_fechado_insercao_centavos,
      input.aceita_insercao,
      input.aceita_pacote,
      input.administra_outros_sites,
      input.outros_sites_urls,
      input.dentro_tabela_precos,
      input.observacoes,
      input.responsavel_id,
      usuarioId
    )
    .run();
  return result.meta.last_row_id as number;
}

export async function atualizarSiteProspectado(
  id: number,
  input: SiteProspectadoInput,
  usuarioId: number
): Promise<void> {
  const atual = await getSiteProspectado(id);
  if (!atual) throw new Error('Site prospectado não encontrado');

  await db()
    .prepare(
      `UPDATE sites_prospectados
          SET url_site = ?, domain_rating = ?, trafego_estimado = ?, nicho = ?, canal = ?, tipo_contato = ?,
              status = ?, num_tentativas = ?, data_contato = ?, link_email = ?,
              valor_solicitado_white_centavos = ?, valor_solicitado_black_centavos = ?,
              valor_fechado_white_centavos = ?, valor_fechado_black_centavos = ?, valor_fechado_insercao_centavos = ?,
              aceita_insercao = ?, aceita_pacote = ?, administra_outros_sites = ?, outros_sites_urls = ?,
              dentro_tabela_precos = ?, observacoes = ?, responsavel_id = ?, atualizado_em = datetime('now')
        WHERE id = ?`
    )
    .bind(
      input.url_site,
      input.domain_rating,
      input.trafego_estimado,
      input.nicho,
      input.canal,
      input.tipo_contato,
      input.status,
      input.num_tentativas,
      input.data_contato,
      input.link_email,
      input.valor_solicitado_white_centavos,
      input.valor_solicitado_black_centavos,
      input.valor_fechado_white_centavos,
      input.valor_fechado_black_centavos,
      input.valor_fechado_insercao_centavos,
      input.aceita_insercao,
      input.aceita_pacote,
      input.administra_outros_sites,
      input.outros_sites_urls,
      input.dentro_tabela_precos,
      input.observacoes,
      input.responsavel_id,
      id
    )
    .run();

  await registrarHistorico(
    'sites_prospectados',
    id,
    usuarioId,
    atual as unknown as Record<string, unknown>,
    input as unknown as Record<string, unknown>
  );
}

export async function deletarSiteProspectado(id: number): Promise<void> {
  await db().prepare('DELETE FROM sites_prospectados WHERE id = ?').bind(id).run();
}

export interface PainelSemanalSemana {
  semana: string;
  total: number;
  aguardando: number;
  respondentes: number;
  via_whatsapp: number;
  via_email: number;
  followups: number;
  sites_fechados: number;
  novos_sites_derivados: number;
  taxa_resposta: number | null;
  taxa_negociacao: number | null;
  taxa_fechamento_contatados: number | null;
  taxa_fechamento_respondentes: number | null;
  taxa_recusa: number | null;
  valor_medio_white_centavos: number | null;
  valor_medio_black_centavos: number | null;
  valor_medio_insercao_centavos: number | null;
  pct_aceita_insercao: number | null;
  pct_administra_outros_sites: number | null;
  pct_dentro_tabela_precos: number | null;
  pct_pacote_fechado: number | null;
  pct_perguntou_insercao: number | null;
  pct_perguntou_outros_dominios: number | null;
}

export async function listPainelSemanal(): Promise<PainelSemanalSemana[]> {
  const { results } = await db()
    .prepare('SELECT * FROM v_prospeccao_semanal ORDER BY semana DESC')
    .all<PainelSemanalSemana>();
  return results;
}

export interface OverviewVolume {
  sites_contatados_total: number;
  sites_contatados_media_semana: number | null;
  sites_contatados_semana_atual: number;
  contatos_whatsapp_total: number;
  contatos_whatsapp_media_semana: number | null;
  contatos_whatsapp_semana_atual: number;
  contatos_email_total: number;
  contatos_email_media_semana: number | null;
  contatos_email_semana_atual: number;
  followups_total: number;
  followups_media_semana: number | null;
  followups_semana_atual: number;
}

export async function getProspeccaoOverviewVolume(): Promise<OverviewVolume> {
  const row = await db().prepare('SELECT * FROM v_prospeccao_overview_volume').first<OverviewVolume>();
  return (
    row ?? {
      sites_contatados_total: 0,
      sites_contatados_media_semana: null,
      sites_contatados_semana_atual: 0,
      contatos_whatsapp_total: 0,
      contatos_whatsapp_media_semana: null,
      contatos_whatsapp_semana_atual: 0,
      contatos_email_total: 0,
      contatos_email_media_semana: null,
      contatos_email_semana_atual: 0,
      followups_total: 0,
      followups_media_semana: null,
      followups_semana_atual: 0
    }
  );
}

export interface OverviewConversao {
  taxa_resposta_total: number | null;
  taxa_resposta_media_semana: number | null;
  taxa_resposta_semana_atual: number | null;
  taxa_negociacao_total: number | null;
  taxa_negociacao_media_semana: number | null;
  taxa_negociacao_semana_atual: number | null;
  taxa_fechamento_contatados_total: number | null;
  taxa_fechamento_contatados_media_semana: number | null;
  taxa_fechamento_contatados_semana_atual: number | null;
  taxa_fechamento_respondentes_total: number | null;
  taxa_fechamento_respondentes_media_semana: number | null;
  taxa_fechamento_respondentes_semana_atual: number | null;
  taxa_recusa_total: number | null;
  taxa_recusa_media_semana: number | null;
  taxa_recusa_semana_atual: number | null;
}

export async function getProspeccaoOverviewConversao(): Promise<OverviewConversao> {
  const row = await db().prepare('SELECT * FROM v_prospeccao_overview_conversao').first<OverviewConversao>();
  return (
    row ?? {
      taxa_resposta_total: null,
      taxa_resposta_media_semana: null,
      taxa_resposta_semana_atual: null,
      taxa_negociacao_total: null,
      taxa_negociacao_media_semana: null,
      taxa_negociacao_semana_atual: null,
      taxa_fechamento_contatados_total: null,
      taxa_fechamento_contatados_media_semana: null,
      taxa_fechamento_contatados_semana_atual: null,
      taxa_fechamento_respondentes_total: null,
      taxa_fechamento_respondentes_media_semana: null,
      taxa_fechamento_respondentes_semana_atual: null,
      taxa_recusa_total: null,
      taxa_recusa_media_semana: null,
      taxa_recusa_semana_atual: null
    }
  );
}

export interface OverviewComercial {
  sites_fechados_geral: number;
  sites_fechados_ultima_semana: number;
  sites_fechados_semana_atual: number;
  valor_medio_white_geral: number | null;
  valor_medio_white_ultima_semana: number | null;
  valor_medio_white_semana_atual: number | null;
  valor_medio_black_geral: number | null;
  valor_medio_black_ultima_semana: number | null;
  valor_medio_black_semana_atual: number | null;
  valor_medio_insercao_geral: number | null;
  valor_medio_insercao_ultima_semana: number | null;
  valor_medio_insercao_semana_atual: number | null;
  pct_aceita_insercao_geral: number | null;
  pct_aceita_insercao_ultima_semana: number | null;
  pct_aceita_insercao_semana_atual: number | null;
  pct_administra_outros_geral: number | null;
  pct_administra_outros_ultima_semana: number | null;
  pct_administra_outros_semana_atual: number | null;
  novos_sites_derivados_geral: number;
  novos_sites_derivados_ultima_semana: number;
  novos_sites_derivados_semana_atual: number;
}

export async function getProspeccaoOverviewComercial(): Promise<OverviewComercial> {
  const row = await db().prepare('SELECT * FROM v_prospeccao_overview_comercial').first<OverviewComercial>();
  return (
    row ?? {
      sites_fechados_geral: 0,
      sites_fechados_ultima_semana: 0,
      sites_fechados_semana_atual: 0,
      valor_medio_white_geral: null,
      valor_medio_white_ultima_semana: null,
      valor_medio_white_semana_atual: null,
      valor_medio_black_geral: null,
      valor_medio_black_ultima_semana: null,
      valor_medio_black_semana_atual: null,
      valor_medio_insercao_geral: null,
      valor_medio_insercao_ultima_semana: null,
      valor_medio_insercao_semana_atual: null,
      pct_aceita_insercao_geral: null,
      pct_aceita_insercao_ultima_semana: null,
      pct_aceita_insercao_semana_atual: null,
      pct_administra_outros_geral: null,
      pct_administra_outros_ultima_semana: null,
      pct_administra_outros_semana_atual: null,
      novos_sites_derivados_geral: 0,
      novos_sites_derivados_ultima_semana: 0,
      novos_sites_derivados_semana_atual: 0
    }
  );
}

export interface OverviewQualidade {
  pct_dentro_tabela_total: number | null;
  pct_dentro_tabela_media_semana: number | null;
  pct_dentro_tabela_semana_atual: number | null;
  pct_pacote_fechado_total: number | null;
  pct_pacote_fechado_media_semana: number | null;
  pct_pacote_fechado_semana_atual: number | null;
  pct_perguntou_insercao_total: number | null;
  pct_perguntou_insercao_media_semana: number | null;
  pct_perguntou_insercao_semana_atual: number | null;
  pct_perguntou_outros_total: number | null;
  pct_perguntou_outros_media_semana: number | null;
  pct_perguntou_outros_semana_atual: number | null;
}

export async function getProspeccaoOverviewQualidade(): Promise<OverviewQualidade> {
  const row = await db().prepare('SELECT * FROM v_prospeccao_overview_qualidade').first<OverviewQualidade>();
  return (
    row ?? {
      pct_dentro_tabela_total: null,
      pct_dentro_tabela_media_semana: null,
      pct_dentro_tabela_semana_atual: null,
      pct_pacote_fechado_total: null,
      pct_pacote_fechado_media_semana: null,
      pct_pacote_fechado_semana_atual: null,
      pct_perguntou_insercao_total: null,
      pct_perguntou_insercao_media_semana: null,
      pct_perguntou_insercao_semana_atual: null,
      pct_perguntou_outros_total: null,
      pct_perguntou_outros_media_semana: null,
      pct_perguntou_outros_semana_atual: null
    }
  );
}

// ---------- Tabela de Preços (Prospecção de Sites) ----------

export async function listTabelaPrecoFaixas(): Promise<TabelaPrecoFaixa[]> {
  const { results } = await db()
    .prepare('SELECT * FROM tabela_precos_faixas ORDER BY ordem')
    .all<TabelaPrecoFaixa>();
  return results;
}

export async function getTabelaPrecoFaixa(id: number): Promise<TabelaPrecoFaixa | null> {
  const row = await db().prepare('SELECT * FROM tabela_precos_faixas WHERE id = ?').bind(id).first<TabelaPrecoFaixa>();
  return row ?? null;
}

export interface TabelaPrecoFaixaInput {
  ordem: number;
  dr_min: number;
  dr_max: number | null;
  trafego_min: number | null;
  trafego_max: number | null;
  valor_min_centavos: number;
  valor_max_centavos: number;
  observacao: string | null;
}

export async function atualizarTabelaPrecoFaixa(
  id: number,
  input: TabelaPrecoFaixaInput,
  usuarioId: number
): Promise<void> {
  const atual = await getTabelaPrecoFaixa(id);
  if (!atual) throw new Error('Faixa de preço não encontrada');

  await db()
    .prepare(
      `UPDATE tabela_precos_faixas
          SET ordem = ?, dr_min = ?, dr_max = ?, trafego_min = ?, trafego_max = ?,
              valor_min_centavos = ?, valor_max_centavos = ?, observacao = ?
        WHERE id = ?`
    )
    .bind(
      input.ordem,
      input.dr_min,
      input.dr_max,
      input.trafego_min,
      input.trafego_max,
      input.valor_min_centavos,
      input.valor_max_centavos,
      input.observacao,
      id
    )
    .run();

  await registrarHistorico(
    'tabela_precos_faixas',
    id,
    usuarioId,
    atual as unknown as Record<string, unknown>,
    input as unknown as Record<string, unknown>
  );
}

export async function listTabelaPrecoRedFlags(): Promise<TabelaPrecoRedFlag[]> {
  const { results } = await db()
    .prepare('SELECT * FROM tabela_precos_red_flags ORDER BY ordem')
    .all<TabelaPrecoRedFlag>();
  return results;
}

export async function getTabelaPrecoRedFlag(id: number): Promise<TabelaPrecoRedFlag | null> {
  const row = await db()
    .prepare('SELECT * FROM tabela_precos_red_flags WHERE id = ?')
    .bind(id)
    .first<TabelaPrecoRedFlag>();
  return row ?? null;
}

export interface TabelaPrecoRedFlagInput {
  ordem: number;
  sinal_de_alerta: string;
  possivel_causa: string;
}

export async function atualizarTabelaPrecoRedFlag(
  id: number,
  input: TabelaPrecoRedFlagInput,
  usuarioId: number
): Promise<void> {
  const atual = await getTabelaPrecoRedFlag(id);
  if (!atual) throw new Error('Red flag não encontrada');

  await db()
    .prepare('UPDATE tabela_precos_red_flags SET ordem = ?, sinal_de_alerta = ?, possivel_causa = ? WHERE id = ?')
    .bind(input.ordem, input.sinal_de_alerta, input.possivel_causa, id)
    .run();

  await registrarHistorico(
    'tabela_precos_red_flags',
    id,
    usuarioId,
    atual as unknown as Record<string, unknown>,
    input as unknown as Record<string, unknown>
  );
}
