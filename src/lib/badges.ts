const CLASSES: Record<string, string> = {
  // status_relacionamento (clientes)
  ativo: 'bg-emerald-100 text-emerald-700',
  em_risco: 'bg-amber-100 text-amber-700',
  perdido: 'bg-red-100 text-red-700',
  nunca_comprou: 'bg-slate-100 text-slate-600',

  // status pedidos
  aguardando_producao: 'bg-slate-100 text-slate-600',
  em_producao: 'bg-blue-100 text-blue-700',
  aguardando_publicacao: 'bg-amber-100 text-amber-700',
  entregue: 'bg-emerald-100 text-emerald-700',
  pagamento_realizado: 'bg-emerald-100 text-emerald-800',
  com_problema: 'bg-red-100 text-red-700',

  // resultado ações comerciais
  sem_resposta: 'bg-slate-100 text-slate-600',
  em_andamento: 'bg-blue-100 text-blue-700',
  converteu_em_venda: 'bg-emerald-100 text-emerald-700',
  nao_teve_interesse: 'bg-red-100 text-red-700',
  completo: 'bg-emerald-100 text-emerald-800'
};

export function badgeClasses(value: string): string {
  return CLASSES[value] ?? 'bg-slate-100 text-slate-600';
}
