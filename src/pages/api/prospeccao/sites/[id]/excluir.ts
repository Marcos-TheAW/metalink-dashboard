import type { APIRoute } from 'astro';
import { deletarSiteProspectado } from '../../../../../lib/db';

export const POST: APIRoute = async ({ params, redirect }) => {
  const id = Number(params.id);
  if (Number.isFinite(id)) {
    await deletarSiteProspectado(id);
  }
  return redirect('/prospeccao/sites');
};
