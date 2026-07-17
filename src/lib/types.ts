export type Papel = 'admin' | 'colaborador';

export type Canal = 'presswhizz' | 'white_press' | 'cliente_direto_br' | 'cliente_direto_intl';

export type StatusPedido =
  | 'aguardando_producao'
  | 'em_producao'
  | 'aguardando_publicacao'
  | 'entregue'
  | 'pagamento_realizado'
  | 'com_problema';

export type CanalComercial = 'whatsapp' | 'email' | 'facebook';

export type TipoAcao =
  | 'follow_up'
  | 'follow_up_risco'
  | 'proposta_nova'
  | 'upsell_cross_sell'
  | 'prospeccao_novo_cliente'
  | 'reativacao_cliente_perdido';

export type ResultadoAcao =
  | 'sem_resposta'
  | 'em_andamento'
  | 'converteu_em_venda'
  | 'nao_teve_interesse'
  | 'completo';

export type StatusRelacionamento = 'ativo' | 'em_risco' | 'perdido' | 'nunca_comprou';

export const CANAIS: { value: Canal; label: string }[] = [
  { value: 'presswhizz', label: 'PressWhizz' },
  { value: 'white_press', label: 'White Press' },
  { value: 'cliente_direto_br', label: 'Cliente Direto BR' },
  { value: 'cliente_direto_intl', label: 'Cliente Direto Internacional' }
];

export const STATUS_PEDIDO: { value: StatusPedido; label: string }[] = [
  { value: 'aguardando_producao', label: 'Aguardando Produção' },
  { value: 'em_producao', label: 'Em Produção' },
  { value: 'aguardando_publicacao', label: 'Aguardando Publicação' },
  { value: 'entregue', label: 'Entregue' },
  { value: 'pagamento_realizado', label: 'Pagamento Realizado' },
  { value: 'com_problema', label: 'Com Problema' }
];

export const CANAIS_COMERCIAIS: { value: CanalComercial; label: string }[] = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'E-mail' },
  { value: 'facebook', label: 'Facebook' }
];

export const TIPOS_ACAO: { value: TipoAcao; label: string }[] = [
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'follow_up_risco', label: 'Follow-up Cliente em Risco' },
  { value: 'proposta_nova', label: 'Proposta Nova' },
  { value: 'upsell_cross_sell', label: 'Upsell / Cross-sell' },
  { value: 'prospeccao_novo_cliente', label: 'Prospecção Novo Cliente' },
  { value: 'reativacao_cliente_perdido', label: 'Reativação de Cliente Perdido' }
];

export const RESULTADOS_ACAO: { value: ResultadoAcao; label: string }[] = [
  { value: 'sem_resposta', label: 'Sem Resposta' },
  { value: 'em_andamento', label: 'Em Andamento' },
  { value: 'converteu_em_venda', label: 'Converteu em Venda' },
  { value: 'nao_teve_interesse', label: 'Não Teve Interesse' },
  { value: 'completo', label: 'Completo' }
];

export const STATUS_RELACIONAMENTO_LABEL: Record<StatusRelacionamento, string> = {
  ativo: 'Ativo',
  em_risco: 'Em Risco',
  perdido: 'Perdido',
  nunca_comprou: 'Nunca Comprou'
};

export function labelFor(list: { value: string; label: string }[], value: string): string {
  return list.find((item) => item.value === value)?.label ?? value;
}

export function centavosParaReais(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatarDataBR(dataISO: string | null): string {
  if (!dataISO) return '—';
  const [ano, mes, dia] = dataISO.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

export function segundaFeiraDaSemana(dataISO: string): string {
  const data = new Date(`${dataISO}T00:00:00Z`);
  const diaSemana = data.getUTCDay();
  const diff = diaSemana === 0 ? -6 : 1 - diaSemana;
  data.setUTCDate(data.getUTCDate() + diff);
  return data.toISOString().slice(0, 10);
}

const NOMES_MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro'
];

export function nomeMes(mesISO: string): string {
  const [ano, mes] = mesISO.split('-');
  const nome = NOMES_MESES[parseInt(mes, 10) - 1];
  return nome ? `${nome}/${ano}` : mesISO;
}

export interface Usuario {
  id: number;
  email: string;
  nome: string;
  papel: Papel;
  ativo: number;
}

export interface UsuarioCredenciais extends Usuario {
  senha_hash: string | null;
  senha_salt: string | null;
  tentativas_falhas: number;
  bloqueado_ate: string | null;
}

export interface Cliente {
  id: number;
  nome: string;
  observacao: string | null;
  criado_em: string;
}

export interface ClienteStatus {
  id: number;
  nome: string;
  observacao: string | null;
  ultimo_pedido: string | null;
  dias_sem_pedido: number | null;
  ultimo_contato: string | null;
  dias_sem_contato: number | null;
  total_pedidos: number;
  receita_total_centavos: number;
  status_relacionamento: StatusRelacionamento;
  key_account: number;
}

export interface Pedido {
  id: number;
  cliente_id: number;
  canal: Canal;
  qtd_links: number;
  valor_centavos: number;
  data_pedido: string;
  prazo_entrega: string | null;
  status: StatusPedido;
  link_detalhe: string | null;
  observacao: string | null;
  responsavel_id: number | null;
  criado_por: number;
  criado_em: string;
  atualizado_em: string;
}

export interface AcaoComercial {
  id: number;
  cliente_id: number;
  canal: CanalComercial;
  tipo: TipoAcao;
  resultado: ResultadoAcao;
  observacoes: string | null;
  data_acao: string;
  responsavel_id: number | null;
  criado_por: number;
  criado_em: string;
  atualizado_em: string;
}

export interface KpisGerais {
  total_pedidos: number;
  receita_total_centavos: number;
  ticket_medio_centavos: number;
  total_acoes: number;
  acoes_convertidas: number;
  taxa_conversao: number;
  receita_em_risco_centavos: number;
}

// ---------- Prospecção de Sites ----------

export type CanalProspeccao = 'whatsapp' | 'email';

export type TipoContatoProspeccao = 'whatsapp_business' | 'email_comercial' | 'email_pessoal' | 'formulario';

export type StatusProspeccao =
  | 'nao_contatado'
  | 'contatado_aguardando_resposta'
  | 'em_negociacao'
  | 'proposta_enviada'
  | 'fechado'
  | 'sem_interesse'
  | 'sem_resposta_followup';

export type TriEstado = 'sim' | 'nao' | 'nao_perguntado';
export type SimNao = 'sim' | 'nao';

export const CANAIS_PROSPECCAO: { value: CanalProspeccao; label: string }[] = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'E-mail' }
];

export const TIPOS_CONTATO_PROSPECCAO: { value: TipoContatoProspeccao; label: string }[] = [
  { value: 'whatsapp_business', label: 'WhatsApp Business' },
  { value: 'email_comercial', label: 'E-mail comercial' },
  { value: 'email_pessoal', label: 'E-mail pessoal' },
  { value: 'formulario', label: 'Formulário' }
];

export const STATUS_PROSPECCAO: { value: StatusProspeccao; label: string }[] = [
  { value: 'nao_contatado', label: 'Não Contatado' },
  { value: 'contatado_aguardando_resposta', label: 'Contatado - Aguardando Resposta' },
  { value: 'em_negociacao', label: 'Em Negociação' },
  { value: 'proposta_enviada', label: 'Proposta Enviada' },
  { value: 'fechado', label: 'Fechado' },
  { value: 'sem_interesse', label: 'Sem Interesse' },
  { value: 'sem_resposta_followup', label: 'Sem Resposta (Follow-up)' }
];

export const OPCOES_TRI_ESTADO: { value: TriEstado; label: string }[] = [
  { value: 'sim', label: 'Sim' },
  { value: 'nao', label: 'Não' },
  { value: 'nao_perguntado', label: 'Não Perguntado' }
];

export const OPCOES_SIM_NAO: { value: SimNao; label: string }[] = [
  { value: 'sim', label: 'Sim' },
  { value: 'nao', label: 'Não' }
];

export interface SiteProspectado {
  id: number;
  url_site: string;
  domain_rating: number | null;
  trafego_estimado: number | null;
  nicho: string | null;
  canal: CanalProspeccao;
  tipo_contato: TipoContatoProspeccao;
  status: StatusProspeccao;
  num_tentativas: number;
  data_contato: string;
  link_email: string | null;
  valor_solicitado_white_centavos: number | null;
  valor_solicitado_black_centavos: number | null;
  valor_fechado_white_centavos: number | null;
  valor_fechado_black_centavos: number | null;
  valor_fechado_insercao_centavos: number | null;
  aceita_insercao: TriEstado | null;
  aceita_pacote: TriEstado | null;
  administra_outros_sites: TriEstado | null;
  outros_sites_urls: string | null;
  dentro_tabela_precos: SimNao | null;
  observacoes: string | null;
  responsavel_id: number | null;
  criado_por: number;
  criado_em: string;
  atualizado_em: string;
}

export interface TabelaPrecoFaixa {
  id: number;
  ordem: number;
  dr_min: number;
  dr_max: number | null;
  trafego_min: number | null;
  trafego_max: number | null;
  valor_min_centavos: number;
  valor_max_centavos: number;
  observacao: string | null;
}

export interface TabelaPrecoRedFlag {
  id: number;
  ordem: number;
  sinal_de_alerta: string;
  possivel_causa: string;
}

export function centavosOuTraco(centavos: number | null | undefined): string {
  return centavos === null || centavos === undefined ? '—' : centavosParaReais(centavos);
}

export function percentualOuTraco(fracao: number | null | undefined): string {
  return fracao === null || fracao === undefined || !Number.isFinite(fracao) ? '—' : `${(fracao * 100).toFixed(1)}%`;
}

export function numeroOuTraco(valor: number | null | undefined): string {
  return valor === null || valor === undefined || !Number.isFinite(valor) ? '—' : valor.toLocaleString('pt-BR');
}
