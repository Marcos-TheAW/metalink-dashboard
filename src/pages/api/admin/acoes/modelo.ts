import type { APIRoute } from 'astro';
import * as XLSX from 'xlsx';
import { CABECALHO_MODELO_ACOES } from '../../../../lib/importacao';

export const GET: APIRoute = async ({ locals }) => {
  // Checagem redundante: o middleware já bloqueia /api/admin para não-admins.
  if (locals.usuario.papel !== 'admin') {
    return new Response('Acesso restrito a administradores.', { status: 403 });
  }

  const workbook = XLSX.utils.book_new();
  const planilha = XLSX.utils.aoa_to_sheet([CABECALHO_MODELO_ACOES]);
  // Larguras de coluna aproximadas para o cabeçalho ficar legível ao abrir no Excel/Sheets.
  planilha['!cols'] = CABECALHO_MODELO_ACOES.map((titulo) => ({ wch: Math.max(titulo.length, 12) }));
  XLSX.utils.book_append_sheet(workbook, planilha, 'Ações Comerciais');

  const arquivo = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

  return new Response(arquivo, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="modelo-acoes-comerciais.xlsx"'
    }
  });
};
