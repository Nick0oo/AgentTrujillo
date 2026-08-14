-- ============================================================
-- 005_vital_signs.sql
-- Signos vitales por consulta — permite análisis de tendencias
-- ============================================================

CREATE TABLE public.vital_signs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinical_record_id    UUID NOT NULL REFERENCES public.clinical_records(id) ON DELETE CASCADE,
  child_id              UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,

  -- Métricas pediátricas
  weight_kg             NUMERIC(5,2),         -- Peso en kg
  height_cm             NUMERIC(5,1),         -- Altura en cm
  temperature_c         NUMERIC(4,1),         -- Temperatura en °C
  heart_rate            INTEGER,              -- Frecuencia cardíaca (bpm)
  respiratory_rate      INTEGER,              -- Frecuencia respiratoria (rpm)
  blood_pressure        TEXT,                 -- Presión arterial (ej: "90/60")
  head_circumference_cm NUMERIC(5,1),         -- Perímetro cefálico (clave en pediatría)
  oxygen_saturation     NUMERIC(4,1),         -- SpO2 %

  -- BMI calculado automáticamente (columna generada)
  bmi                   NUMERIC(5,2) GENERATED ALWAYS AS (
                          CASE
                            WHEN height_cm > 0 AND weight_kg > 0
                            THEN ROUND(
                              weight_kg / ((height_cm / 100.0) * (height_cm / 100.0)),
                              2
                            )
                            ELSE NULL
                          END
                        ) STORED,

  notes                 TEXT,
  measured_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX vital_signs_clinical_record_idx ON public.vital_signs (clinical_record_id);
CREATE INDEX vital_signs_child_id_idx ON public.vital_signs (child_id);
CREATE INDEX vital_signs_child_date_idx ON public.vital_signs (child_id, measured_at DESC);

-- Un único registro de signos vitales por historia clínica
CREATE UNIQUE INDEX vital_signs_record_unique ON public.vital_signs (clinical_record_id);

-- ────────────────────────────────────────────────────────────
-- RLS
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.vital_signs ENABLE ROW LEVEL SECURITY;

-- Admin: acceso total
CREATE POLICY vital_signs_admin_all ON public.vital_signs
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Padres: solo lectura de signos de sus hijos
CREATE POLICY vital_signs_parent_select ON public.vital_signs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.children
      WHERE children.id = vital_signs.child_id
        AND children.parent_id = auth.uid()
    )
  );

-- ────────────────────────────────────────────────────────────
-- Trigger: sincronizar peso/altura actuales en children
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_child_vitals()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.children
  SET
    weight_kg  = COALESCE(NEW.weight_kg,  children.weight_kg),
    height_cm  = COALESCE(NEW.height_cm,  children.height_cm),
    updated_at = now()
  WHERE id = NEW.child_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_child_vitals_on_insert
  AFTER INSERT ON public.vital_signs
  FOR EACH ROW EXECUTE FUNCTION public.sync_child_vitals();

CREATE TRIGGER sync_child_vitals_on_update
  AFTER UPDATE ON public.vital_signs
  FOR EACH ROW EXECUTE FUNCTION public.sync_child_vitals();
