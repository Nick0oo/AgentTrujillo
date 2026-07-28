-- ============================================================
-- 012_rag_storage.sql
-- Bucket de Storage para documentos RAG + RLS policies
-- + ALTER file_type constraint para nuevos formatos
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Ampliar el CHECK constraint de file_type en rag_documents
--    para aceptar EPUB, XLSX, XLS además de los formatos base
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.rag_documents
  DROP CONSTRAINT IF EXISTS rag_documents_file_type_check;

ALTER TABLE public.rag_documents
  ADD CONSTRAINT rag_documents_file_type_check
  CHECK (file_type IN ('pdf', 'docx', 'txt', 'md', 'url', 'epub', 'xlsx', 'xls'));

-- ────────────────────────────────────────────────────────────
-- 2. Agregar columna file_size_bytes para trazabilidad
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.rag_documents
  ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT;

-- ────────────────────────────────────────────────────────────
-- 3. Crear Bucket 'rag-documents' (privado)
--    Acceso solo mediante signed URLs temporales desde el servidor
-- ────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'rag-documents',
  'rag-documents',
  false,  -- bucket PRIVADO
  125829120,  -- 120 MB en bytes
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'text/plain',
    'text/markdown',
    'application/epub+zip',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/octet-stream'  -- fallback para formatos que los browsers reportan distinto
  ]
)
ON CONFLICT (id) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 4. RLS Policies para el Bucket 'rag-documents'
--    Solo el admin puede subir, leer, actualizar y eliminar
--    Los archivos son accedidos por el servidor via service_role
-- ────────────────────────────────────────────────────────────

-- Admin puede LEER archivos del bucket (para generar signed URLs)
CREATE POLICY "Admin can read rag documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'rag-documents'
  AND public.is_admin()
);

-- Admin puede SUBIR archivos al bucket
-- Estructura: {document_id}/{filename_original}
CREATE POLICY "Admin can upload rag documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'rag-documents'
  AND public.is_admin()
);

-- Admin puede ACTUALIZAR (sobrescribir) archivos
CREATE POLICY "Admin can update rag documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'rag-documents'
  AND public.is_admin()
);

-- Admin puede ELIMINAR archivos
CREATE POLICY "Admin can delete rag documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'rag-documents'
  AND public.is_admin()
);
