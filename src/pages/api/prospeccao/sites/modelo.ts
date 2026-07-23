import type { APIRoute } from 'astro';
import { CABECALHO_MODELO } from '../../../../lib/importacaoSites';

export const GET: APIRoute = async () => {
  const linha = CABECALHO_MODELO.map((c) => (c.includes(',') ? `"${c}"` : c)).join(',');
  return new Response(`${linha}\n`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="modelo-registro-sites.csv"'
    }
  });
};
