-- ============================================================
-- 011_audit.sql
-- Logs de auditoría — tracking de cambios críticos
-- ============================================================

CREATE TABLE public.audit_logs (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- NULL si es sistema
  action      TEXT NOT NULL,          -- 'create', 'update', 'delete', 'login', 'view'
  table_name  TEXT NOT NULL,          -- Tabla afectada
  record_id   UUID,                   -- ID del registro afectado
  old_data    JSONB,                  -- Snapshot anterior (en updates/deletes)
  new_data    JSONB,                  -- Snapshot nuevo (en creates/updates)
  ip_address  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices (BRIN para created_at: tabla de solo inserción, grande y ordenada por tiempo)
CREATE INDEX audit_logs_user_id_idx ON public.audit_logs (user_id);
CREATE INDEX audit_logs_table_name_idx ON public.audit_logs (table_name, created_at DESC);
CREATE INDEX audit_logs_record_id_idx ON public.audit_logs (record_id);
CREATE INDEX audit_logs_created_at_brin ON public.audit_logs USING BRIN (created_at);

-- ────────────────────────────────────────────────────────────
-- RLS: solo admin puede ver/consultar
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_logs_admin_only ON public.audit_logs
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ────────────────────────────────────────────────────────────
-- Trigger de auditoría en clinical_records
-- (función definida en 004_clinical_records.sql)
-- ────────────────────────────────────────────────────────────
CREATE TRIGGER audit_clinical_records_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.clinical_records
  FOR EACH ROW EXECUTE FUNCTION public.audit_clinical_records();
