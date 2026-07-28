-- ============================================================
-- 009_vectors.sql
-- Vectores para RAG — embeddings clínicos por niño + documentos
-- Modelo: Gemini text-embedding-004 (768 dimensiones)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- Tabla: child_embeddings
-- Vectores de historias clínicas para el chat IA por niño
-- ────────────────────────────────────────────────────────────
CREATE TABLE public.child_embeddings (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  child_id            UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  clinical_record_id  UUID REFERENCES public.clinical_records(id) ON DELETE CASCADE,

  content             TEXT NOT NULL,          -- Texto original del chunk
  embedding           VECTOR(768) NOT NULL,   -- Gemini text-embedding-004

  -- Metadata para filtrado y trazabilidad
  -- Ejemplo: {"section": "diagnosis", "date": "2026-03-15", "record_type": "combined"}
  metadata            JSONB NOT NULL DEFAULT '{}'
                      CHECK (jsonb_typeof(metadata) = 'object'),

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice HNSW para búsqueda vectorial semántica rápida
-- vector_cosine_ops = distancia coseno (recomendado para embeddings de texto normalizados)
CREATE INDEX child_embeddings_hnsw_idx ON public.child_embeddings
  USING hnsw (embedding vector_cosine_ops);

-- Índices relacionales
CREATE INDEX child_embeddings_child_id_idx ON public.child_embeddings (child_id);
CREATE INDEX child_embeddings_record_id_idx ON public.child_embeddings (clinical_record_id);
CREATE INDEX child_embeddings_metadata_gin ON public.child_embeddings USING GIN (metadata);

-- ────────────────────────────────────────────────────────────
-- RLS child_embeddings
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.child_embeddings ENABLE ROW LEVEL SECURITY;

-- Admin: acceso total
CREATE POLICY child_emb_admin_all ON public.child_embeddings
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Padres: lectura de embeddings de sus hijos (necesario para el chat IA)
CREATE POLICY child_emb_parent_select ON public.child_embeddings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.children
      WHERE children.id = child_embeddings.child_id
        AND children.parent_id = auth.uid()
    )
  );

-- ────────────────────────────────────────────────────────────
-- Tabla: rag_documents
-- Documentos fuente que el doctor sube para el chatbot
-- ────────────────────────────────────────────────────────────
CREATE TABLE public.rag_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by   UUID NOT NULL REFERENCES public.profiles(id),

  title         TEXT NOT NULL,
  description   TEXT,
  file_url      TEXT NOT NULL,    -- URL en Supabase Storage (bucket: rag-documents)
  file_type     TEXT NOT NULL
                CHECK (file_type IN ('pdf', 'docx', 'txt', 'md', 'url')),
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'processing', 'indexed', 'error')),
  page_count    INTEGER,
  error_message TEXT,             -- Mensaje de error si falla la indexación

  metadata      JSONB NOT NULL DEFAULT '{}'
                CHECK (jsonb_typeof(metadata) = 'object'),

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX rag_documents_status_idx ON public.rag_documents (status);
CREATE INDEX rag_documents_uploaded_by_idx ON public.rag_documents (uploaded_by);
CREATE INDEX rag_documents_status_pending_idx ON public.rag_documents (created_at)
  WHERE status IN ('pending', 'error'); -- Cola de procesamiento

-- ────────────────────────────────────────────────────────────
-- Tabla: rag_embeddings
-- Chunks vectorizados de los documentos del RAG
-- ────────────────────────────────────────────────────────────
CREATE TABLE public.rag_embeddings (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id   UUID NOT NULL REFERENCES public.rag_documents(id) ON DELETE CASCADE,

  content       TEXT NOT NULL,
  embedding     VECTOR(768) NOT NULL,    -- Gemini text-embedding-004
  chunk_index   INTEGER NOT NULL,        -- Posición del chunk en el documento original

  -- Ejemplo: {"page": 3, "section": "conclusion", "source_title": "Guía AIEPI"}
  metadata      JSONB NOT NULL DEFAULT '{}'
                CHECK (jsonb_typeof(metadata) = 'object'),

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice HNSW para búsqueda semántica
CREATE INDEX rag_embeddings_hnsw_idx ON public.rag_embeddings
  USING hnsw (embedding vector_cosine_ops);

CREATE INDEX rag_embeddings_document_id_idx ON public.rag_embeddings (document_id);
CREATE INDEX rag_embeddings_metadata_gin ON public.rag_embeddings USING GIN (metadata);

-- ────────────────────────────────────────────────────────────
-- RLS rag_documents y rag_embeddings
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.rag_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rag_embeddings ENABLE ROW LEVEL SECURITY;

-- Admin: acceso total a documentos
CREATE POLICY rag_docs_admin_all ON public.rag_documents
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Admin: acceso total a embeddings
CREATE POLICY rag_emb_admin_all ON public.rag_embeddings
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Usuarios autenticados: pueden leer embeddings (necesario para el chatbot)
CREATE POLICY rag_emb_authenticated_read ON public.rag_embeddings
  FOR SELECT TO authenticated
  USING (true);

-- Trigger updated_at para documentos RAG
CREATE TRIGGER rag_documents_updated_at
  BEFORE UPDATE ON public.rag_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ────────────────────────────────────────────────────────────
-- Función: búsqueda semántica en historia clínica de un niño
-- Usada por el chat IA de la app móvil
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.search_child_embeddings(
  p_child_id        UUID,
  p_query_embedding VECTOR(768),
  p_match_count     INTEGER DEFAULT 5,
  p_match_threshold FLOAT   DEFAULT 0.6
)
RETURNS TABLE (
  id                 BIGINT,
  child_id           UUID,
  clinical_record_id UUID,
  content            TEXT,
  metadata           JSONB,
  similarity         FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ce.id,
    ce.child_id,
    ce.clinical_record_id,
    ce.content,
    ce.metadata,
    (1 - (ce.embedding <=> p_query_embedding))::FLOAT AS similarity
  FROM public.child_embeddings ce
  WHERE ce.child_id = p_child_id
    AND (1 - (ce.embedding <=> p_query_embedding)) >= p_match_threshold
  ORDER BY ce.embedding <=> p_query_embedding
  LIMIT p_match_count;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- Función: búsqueda semántica en documentos del RAG
-- Usada por el chatbot para obtener contexto médico general
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.search_rag_embeddings(
  p_query_embedding VECTOR(768),
  p_match_count     INTEGER DEFAULT 5,
  p_match_threshold FLOAT   DEFAULT 0.6,
  p_filter          JSONB   DEFAULT '{}'
)
RETURNS TABLE (
  id          BIGINT,
  document_id UUID,
  content     TEXT,
  metadata    JSONB,
  similarity  FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    re.id,
    re.document_id,
    re.content,
    re.metadata,
    (1 - (re.embedding <=> p_query_embedding))::FLOAT AS similarity
  FROM public.rag_embeddings re
  WHERE (1 - (re.embedding <=> p_query_embedding)) >= p_match_threshold
    AND (p_filter = '{}'::JSONB OR re.metadata @> p_filter)
  ORDER BY re.embedding <=> p_query_embedding
  LIMIT p_match_count;
END;
$$;
