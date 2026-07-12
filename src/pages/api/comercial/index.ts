import type { APIRoute } from 'astro';
import { criarAcao } from '../../../lib/db';
import { CANAIS_COMERCIAIS, RESULTADOS_ACAO, TIPOS_ACAO } from '../../../lib/types';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const form = await request.formData();

  const clienteId = Number(form.get('cliente_id'));
  const canal = String(form.get('canal') ?? '');
  const tipo = String(form.get('tipo') ?? '');
  const resultado = String(form.get('resultado') ?? '');
  const observacoes = String(form.get('observacoes') ?? '').trim() || null;
  const dataAcao = String(form.get('data_acao') ?? '');
  const responsavelIdRaw = String(form.get('responsavel_id') ?? '');
  const responsavelId = responsavelIdRaw ? Number(responsavelIdRaw) : null;

  const erros: string[] = [];
  if (!clienteId) erros.push('Cliente / prospect é obrigatório.');
  if (!CANAIS_COMERCIAIS.some((c) => c.value === canal)) erros.push('Canal inválido.');
  if (!TIPOS_ACAO.some((t) => t.value === tipo)) erros.push('Tipo de ação inválido.');
  if (!RESULTADOS_ACAO.some((r) => r.value === resultado)) erros.push('Resultado inválido.');
  if (!dataAcao) erros.push('Data da ação é obrigatória.');

  if (erros.length > 0) {
    return redirect(`/comercial/novo?erro=${encodeURIComponent(erros.join(' '))}`);
  }

  const id = await criarAcao(
    {
      cliente_id: clienteId,
      canal,
      tipo,
      resultado,
      observacoes,
      data_acao: dataAcao,
      responsavel_id: responsavelId
    },
    locals.usuario.id
  );

  return redirect(`/comercial/${id}`);
};
