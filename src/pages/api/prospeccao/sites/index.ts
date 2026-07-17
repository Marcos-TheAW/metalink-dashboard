import type { APIRoute } from 'astro';
import { criarSiteProspectado } from '../../../../lib/db';
import {
  CANAIS_PROSPECCAO,
  OPCOES_SIM_NAO,
  OPCOES_TRI_ESTADO,
  STATUS_PROSPECCAO,
  TIPOS_CONTATO_PROSPECCAO,
  segundaFeiraDaSemana
} from '../../../../lib/types';

function paraInteiroOuNull(valor: FormDataEntryValue | null): number | null {
  const texto = String(valor ?? '').trim();
  if (!texto) return null;
  const n = Number(texto);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function paraCentavosOuNull(valor: FormDataEntryValue | null): number | null {
  const texto = String(valor ?? '').trim().replace(',', '.');
  if (!texto) return null;
  const n = parseFloat(texto);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

function paraTextoOuNull(valor: FormDataEntryValue | null): string | null {
  const texto = String(valor ?? '').trim();
  return texto || null;
}

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const form = await request.formData();

  const urlSite = String(form.get('url_site') ?? '').trim();
  const canal = String(form.get('canal') ?? '');
  const tipoContato = String(form.get('tipo_contato') ?? '');
  const status = String(form.get('status') ?? '');
  const numTentativas = Number(form.get('num_tentativas') ?? 1);
  const dataContatoRaw = String(form.get('data_contato') ?? '');
  const aceitaInsercao = paraTextoOuNull(form.get('aceita_insercao'));
  const aceitaPacote = paraTextoOuNull(form.get('aceita_pacote'));
  const administraOutrosSites = paraTextoOuNull(form.get('administra_outros_sites'));
  const dentroTabelaPrecos = paraTextoOuNull(form.get('dentro_tabela_precos'));
  const responsavelIdRaw = String(form.get('responsavel_id') ?? '');
  const responsavelId = responsavelIdRaw ? Number(responsavelIdRaw) : null;

  const erros: string[] = [];
  if (!urlSite) erros.push('URL do site é obrigatória.');
  if (!CANAIS_PROSPECCAO.some((c) => c.value === canal)) erros.push('Canal inválido.');
  if (!TIPOS_CONTATO_PROSPECCAO.some((t) => t.value === tipoContato)) erros.push('Tipo de contato inválido.');
  if (!STATUS_PROSPECCAO.some((s) => s.value === status)) erros.push('Status inválido.');
  if (!dataContatoRaw) erros.push('Data do contato é obrigatória.');
  if (!Number.isFinite(numTentativas) || numTentativas < 1) erros.push('Número de tentativas deve ser ao menos 1.');
  if (aceitaInsercao && !OPCOES_TRI_ESTADO.some((o) => o.value === aceitaInsercao)) erros.push('Opção inválida para "Aceita Inserção".');
  if (aceitaPacote && !OPCOES_TRI_ESTADO.some((o) => o.value === aceitaPacote)) erros.push('Opção inválida para "Aceita Pacote".');
  if (administraOutrosSites && !OPCOES_TRI_ESTADO.some((o) => o.value === administraOutrosSites))
    erros.push('Opção inválida para "Administra Outros Sites".');
  if (dentroTabelaPrecos && !OPCOES_SIM_NAO.some((o) => o.value === dentroTabelaPrecos))
    erros.push('Opção inválida para "Dentro da Tabela de Preços".');

  if (erros.length > 0) {
    return redirect(`/prospeccao/sites/novo?erro=${encodeURIComponent(erros.join(' '))}`);
  }

  const id = await criarSiteProspectado(
    {
      url_site: urlSite,
      domain_rating: paraInteiroOuNull(form.get('domain_rating')),
      trafego_estimado: paraInteiroOuNull(form.get('trafego_estimado')),
      nicho: paraTextoOuNull(form.get('nicho')),
      canal,
      tipo_contato: tipoContato,
      status,
      num_tentativas: numTentativas,
      data_contato: segundaFeiraDaSemana(dataContatoRaw),
      link_email: paraTextoOuNull(form.get('link_email')),
      valor_solicitado_white_centavos: paraCentavosOuNull(form.get('valor_solicitado_white_reais')),
      valor_solicitado_black_centavos: paraCentavosOuNull(form.get('valor_solicitado_black_reais')),
      valor_fechado_white_centavos: paraCentavosOuNull(form.get('valor_fechado_white_reais')),
      valor_fechado_black_centavos: paraCentavosOuNull(form.get('valor_fechado_black_reais')),
      valor_fechado_insercao_centavos: paraCentavosOuNull(form.get('valor_fechado_insercao_reais')),
      aceita_insercao: aceitaInsercao,
      aceita_pacote: aceitaPacote,
      administra_outros_sites: administraOutrosSites,
      outros_sites_urls: paraTextoOuNull(form.get('outros_sites_urls')),
      dentro_tabela_precos: dentroTabelaPrecos,
      observacoes: paraTextoOuNull(form.get('observacoes')),
      responsavel_id: responsavelId
    },
    locals.usuario.id
  );

  return redirect(`/prospeccao/sites/${id}`);
};
