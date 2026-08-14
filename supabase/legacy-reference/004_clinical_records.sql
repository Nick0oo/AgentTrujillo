-- ============================================================
-- 004_clinical_records.sql
-- Historias clínicas — formato tradicional colombiano + SOAP
-- ============================================================

CREATE TABLE public.clinical_records (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id          UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  created_by        UUID NOT NULL REFERENCES public.profiles(id),

  -- Tipo de formato usado en este registro
  record_type       TEXT NOT NULL DEFAULT 'combined'
                    CHECK (record_type IN ('traditional', 'soap', 'combined')),

  -- ═══════════ Historia Clínica Tradicional (7 campos colombianos) ═══════════
  chief_complaint   TEXT,    -- 1. Motivo de consulta
  present_illness   TEXT,    -- 2. Enfermedad actual
  medical_history   TEXT,    -- 3. Antecedentes (personales, familiares, vacunas)
  physical_exam     TEXT,    -- 4. Examen físico
  analysis          TEXT,    -- 5. Análisis
  diagnosis         TEXT,    -- 6. Diagnóstico
  medical_plan      TEXT,    -- 7. Plan u órdenes médicas

  -- ═══════════ Formato SOAP ═══════════
  subjective        TEXT,    -- S: Subjetivo — lo que reporta el padre/madre
  objective         TEXT,    -- O: Objetivo — hallazgos clínicos del doctor
  assessment        TEXT,    -- A: Evaluación — diagnóstico razonado
  plan              TEXT,    -- P: Plan — tratamiento, seguimiento

  -- ═══════════ Datos Flexibles ═══════════
  extra_data        JSONB NOT NULL DEFAULT '{}'
                    CHECK (jsonb_typeof(extra_data) = 'object'),

  -- ═══════════ Control de Vectorización ═══════════
  is_vectorized     BOOLEAN NOT NULL DEFAULT FALSE,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX clinical_records_child_id_idx ON public.clinical_records (child_id);
CREATE INDEX clinical_records_created_by_idx ON public.clinical_records (created_by);
CREATE INDEX clinical_records_child_date_idx ON public.clinical_records (child_id, created_at DESC);
CREATE INDEX clinical_records_vectorized_idx ON public.clinical_records (is_vectorized)
  WHERE is_vectorized = FALSE; -- Para la cola de vectorización
CREATE INDEX clinical_records_extra_data_gin ON public.clinical_records USING GIN (extra_data);

-- ────────────────────────────────────────────────────────────
-- RLS
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.clinical_records ENABLE ROW LEVEL SECURITY;

-- Admin: acceso total (solo el doctor crea/edita)
CREATE POLICY clinical_records_admin_all ON public.clinical_records
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Padres: solo lectura de las historias de sus hijos
CREATE POLICY clinical_records_parent_select ON public.clinical_records
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.children
      WHERE children.id = clinical_records.child_id
        AND children.parent_id = auth.uid()
    )
  );

-- ────────────────────────────────────────────────────────────
-- Trigger: updated_at
-- ────────────────────────────────────────────────────────────
CREATE TRIGGER clinical_records_updated_at
  BEFORE UPDATE ON public.clinical_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ────────────────────────────────────────────────────────────
-- Trigger de Auditoría: registrar cambios en historias clínicas
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.audit_clinical_records()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data)
    VALUES (auth.uid(), 'create', 'clinical_records', NEW.id, to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data)
    VALUES (auth.uid(), 'update', 'clinical_records', NEW.id, to_jsonb(OLD), to_jsonb(NEW));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data)
    VALUES (auth.uid(), 'delete', 'clinical_records', OLD.id, to_jsonb(OLD));
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- NOTA: El trigger de auditoría se crea DESPUÉS de la tabla audit_logs (migration 011)
-- Si se ejecuta todo junto con 000_full_schema.sql, ya estará disponible.
