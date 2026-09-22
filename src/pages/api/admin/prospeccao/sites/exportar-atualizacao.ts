import type { APIRoute } from 'astro';
import * as XLSX from 'xlsx';
import { CABECALHO_ATUALIZACAO } from '../../../../../lib/importacaoSites';
import { listSitesProspectados } from '../../../../../lib/db';
import {
  CANAIS_PROSPECCAO,
  OPCOES_SIM_NAO,
  OPCOES_TRI_ESTADO,
  STATUS_PROSPECCAO,
  TIPOS_CONTATO_PROSPECCAO,
  labelFor
} from '../../../../../lib/types';

export const GET: APIRoute = async ({ locals }) => {
  // Checagem redundante: o middleware já bloqueia /api/admin para não-admins.
  if (locals.usuario.papel !== 'admin') {
    return new Response('Acesso restrito a administradores.', { status: 403 });
  }

  const sites = await listSitesProspectados({});

  const linhas = sites.map((s) => [
    s.id,
    s.url_site,
    s.domain_rating ?? '',
    s.trafego_estimado ?? '',
    s.nicho ?? '',
    labelFor(CANAIS_PROSPECCAO, s.canal),
    labelFor(TIPOS_CONTATO_PROSPECCAO, s.tipo_contato),
    labelFor(STATUS_PROSPECCAO, s.status),
    s.num_tentativas,
    s.data_contato,
    s.link_email ?? '',
    s.valor_solicitado_white_centavos !== null ? s.valor_solicitado_white_centavos / 100 : '',
    s.valor_solicitado_black_centavos !== null ? s.valor_solicitado_black_centavos / 100 : '',
    s.valor_fechado_white_centavos !== null ? s.valor_fechado_white_centavos / 100 : '',
    s.valor_fechado_black_centavos !== null ? s.valor_fechado_black_centavos / 100 : '',
    s.valor_fechado_insercao_centavos !== null ? s.valor_fechado_insercao_centavos / 100 : '',
    s.aceita_insercao ? labelFor(OPCOES_TRI_ESTADO, s.aceita_insercao) : '',
    s.aceita_pacote ? labelFor(OPCOES_TRI_ESTADO, s.aceita_pacote) : '',
    s.administra_outros_sites ? labelFor(OPCOES_TRI_ESTADO, s.administra_outros_sites) : '',
    s.outros_sites_urls ?? '',
    s.dentro_tabela_precos ? labelFor(OPCOES_SIM_NAO, s.dentro_tabela_precos) : '',
    s.observacoes ?? ''
  ]);

  const workbook = XLSX.utils.book_new();
  const planilha = XLSX.utils.aoa_to_sheet([CABECALHO_ATUALIZACAO, ...linhas]);
  planilha['!cols'] = CABECALHO_ATUALIZACAO.map((titulo) => ({ wch: Math.max(titulo.length, 12) }));
  XLSX.utils.book_append_sheet(workbook, planilha, 'Registro de Sites');

  const arquivo = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const dataHoje = new Date().toISOString().slice(0, 10);

  return new Response(arquivo, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="sites-atualizacao-${dataHoje}.xlsx"`
    }
  });
};
