import type { APIRoute } from 'astro';
import * as XLSX from 'xlsx';
import { CABECALHO_MODELO } from '../../../../lib/importacaoSites';

export const GET: APIRoute = async () => {
  const workbook = XLSX.utils.book_new();
  const planilha = XLSX.utils.aoa_to_sheet([CABECALHO_MODELO]);
  // Larguras de coluna aproximadas para o cabeçalho ficar legível ao abrir no Excel/Sheets.
  planilha['!cols'] = CABECALHO_MODELO.map((titulo) => ({ wch: Math.max(titulo.length, 12) }));
  XLSX.utils.book_append_sheet(workbook, planilha, 'Registro de Sites');

  const arquivo = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

  return new Response(arquivo, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="modelo-registro-sites.xlsx"'
    }
  });
};
