import type { APIRoute } from 'astro';
import { atualizarTabelaPrecoFaixa } from '../../../../../lib/db';

export const POST: APIRoute = async ({ request, params, locals, redirect }) => {
  // Checagem redundante: /prospeccao/tabela-precos não está sob /admin, então o
  // middleware não bloqueia automaticamente — o gate precisa estar aqui.
  if (locals.usuario.papel !== 'admin') {
    return new Response('Acesso restrito a administradores.', { status: 403 });
  }

  const id = Number(params.id);
  const form = await request.formData();

  const ordem = Number(form.get('ordem'));
  const drMin = Number(form.get('dr_min'));
  const drMaxRaw = String(form.get('dr_max') ?? '').trim();
  const drMax = drMaxRaw ? Number(drMaxRaw) : null;
  const trafegoMinRaw = String(form.get('trafego_min') ?? '').trim();
  const trafegoMin = trafegoMinRaw ? Number(trafegoMinRaw) : null;
  const trafegoMaxRaw = String(form.get('trafego_max') ?? '').trim();
  const trafegoMax = trafegoMaxRaw ? Number(trafegoMaxRaw) : null;
  const valorMinReais = String(form.get('valor_min_reais') ?? '').replace(',', '.');
  const valorMaxReais = String(form.get('valor_max_reais') ?? '').replace(',', '.');
  const valorMinCentavos = Math.round(parseFloat(valorMinReais) * 100);
  const valorMaxCentavos = Math.round(parseFloat(valorMaxReais) * 100);
  const observacao = String(form.get('observacao') ?? '').trim() || null;

  const erros: string[] = [];
  if (!Number.isFinite(id)) erros.push('Faixa inválida.');
  if (!Number.isFinite(ordem)) erros.push('Ordem inválida.');
  if (!Number.isFinite(drMin)) erros.push('DR mínimo inválido.');
  if (!Number.isFinite(valorMinCentavos) || valorMinCentavos < 0) erros.push('Valor mínimo inválido.');
  if (!Number.isFinite(valorMaxCentavos) || valorMaxCentavos < 0) erros.push('Valor máximo inválido.');

  if (erros.length > 0) {
    return redirect(`/prospeccao/tabela-precos?erro=${encodeURIComponent(erros.join(' '))}`);
  }

  await atualizarTabelaPrecoFaixa(
    id,
    {
      ordem,
      dr_min: drMin,
      dr_max: drMax,
      trafego_min: trafegoMin,
      trafego_max: trafegoMax,
      valor_min_centavos: valorMinCentavos,
      valor_max_centavos: valorMaxCentavos,
      observacao
    },
    locals.usuario.id
  );

  return redirect('/prospeccao/tabela-precos');
};
