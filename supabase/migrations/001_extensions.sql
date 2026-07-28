-- ============================================================
-- 001_extensions.sql
-- Habilitar extensiones necesarias para el proyecto
-- ============================================================

-- pgvector: embeddings para RAG e historia clínica
CREATE EXTENSION IF NOT EXISTS vector;

-- pg_trgm: búsqueda fuzzy de texto (nombres, títulos)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
