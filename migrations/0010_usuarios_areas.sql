-- Controle de acesso por área para colaboradores: admin sempre tem acesso total (ver
-- temAcessoArea() em src/lib/types.ts), esta coluna só é consultada para papel = 'colaborador'.
-- Default preserva o comportamento atual (acesso a tudo) pra quem já existe.
ALTER TABLE usuarios ADD COLUMN areas_permitidas TEXT NOT NULL DEFAULT 'comercial,prospeccao';
