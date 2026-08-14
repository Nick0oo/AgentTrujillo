-- ============================================================
-- 008_clinical_attachments.sql
-- Adjuntos de historias clínicas (labs, ecografías, etc.)
-- ============================================================

CREATE TABLE public.clinical_attachments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinical_record_id  UUID NOT NULL REFERENCES public.clinical_records(id) ON DELETE CASCADE,
  uploaded_by         UUID NOT NULL REFERENCES public.profiles(id),

  file_name           TEXT NOT NULL,        -- Nombre original del archivo
  file_url            TEXT NOT NULL,        -- URL en Supabase Storage (bucket: clinical-attachments)
  file_type           TEXT NOT NULL,        -- MIME type (ej: 'application/pdf', 'image/jpeg')
  file_size_bytes     BIGINT,               -- Tamaño en bytes

  description         TEXT,                 -- Descripción libre (ej: "Hemograma enero 2026")

  attachment_type     TEXT NOT NULL DEFAULT 'other'
                      CHECK (attachment_type IN (
                        'lab_result',   -- Resultado de laboratorio
                        'imaging',      -- Ecografía, radiografía, TAC
                        'prescription', -- Fórmula médica
                        'referral',     -- Remisión a especialista
                        'other'         -- Otro tipo de documento
                      )),

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX clinical_attachments_record_idx ON public.clinical_attachments (clinical_record_id);
CREATE INDEX clinical_attachments_type_idx ON public.clinical_attachments (attachment_type);
CREATE INDEX clinical_attachments_uploaded_by_idx ON public.clinical_attachments (uploaded_by);

-- ────────────────────────────────────────────────────────────
-- RLS
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.clinical_attachments ENABLE ROW LEVEL SECURITY;

-- Admin: acceso total
CREATE POLICY clinical_attachments_admin_all ON public.clinical_attachments
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Padres: solo lectura de adjuntos de las historias de sus hijos
CREATE POLICY clinical_attachments_parent_select ON public.clinical_attachments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clinical_records cr
      JOIN public.children c ON c.id = cr.child_id
      WHERE cr.id = clinical_attachments.clinical_record_id
        AND c.parent_id = auth.uid()
    )
  );
