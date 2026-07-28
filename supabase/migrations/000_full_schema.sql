-- ================================================================
-- 000_full_schema.sql  —  Doc Trujillo SaaS
-- ================================================================
-- Ejecutar una sola vez en un proyecto Supabase vacío.
-- Si necesitas re-ejecutar, usa el bloque DO de limpieza al inicio.
--
-- Orden crítico (restricción de LANGUAGE sql en Postgres):
--   [1] Extensiones
--   [2] update_updated_at()     ← función base, no depende de tablas
--   [3] roles                   ← tabla maestra
--   [4] profiles                ← depende de auth.users y roles
--   [5] Funciones helper        ← is_admin() etc. dependen de profiles
--   [6] RLS de profiles         ← depende de is_admin()
--   [7] Trigger handle_new_user ← depende de profiles + roles
--   [8-...] Resto de tablas     ← depende de profiles / children
-- ================================================================


-- ================================================================
-- BLOQUE 0: Limpieza segura (solo si es re-ejecución)
-- Usa DO $$ para no fallar si las tablas no existen todavía.
-- ================================================================
DO $$
DECLARE
  tbl TEXT;
BEGIN
  -- Eliminar vistas
  DROP VIEW IF EXISTS public.children_with_status CASCADE;

  -- Eliminar tablas en orden inverso (ON DELETE CASCADE se encarga de hijos)
  FOR tbl IN SELECT unnest(ARRAY[
    'audit_logs','chat_messages','chat_conversations',
    'rag_embeddings','rag_documents','child_embeddings',
    'clinical_attachments','subscriptions','post_recommendations',
    'post_categories','post_tags','categories','tags','blog_posts',
    'vital_signs','clinical_records','children','profiles','roles'
  ]) LOOP
    EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', tbl);
  END LOOP;

  -- Eliminar funciones
  DROP FUNCTION IF EXISTS public.audit_clinical_records()            CASCADE;
  DROP FUNCTION IF EXISTS public.touch_conversation_on_message()     CASCADE;
  DROP FUNCTION IF EXISTS public.search_rag_embeddings(vector,int,float,jsonb) CASCADE;
  DROP FUNCTION IF EXISTS public.search_child_embeddings(uuid,vector,int,float) CASCADE;
  DROP FUNCTION IF EXISTS public.get_category_tree()                 CASCADE;
  DROP FUNCTION IF EXISTS public.get_child_subscription_status(uuid) CASCADE;
  DROP FUNCTION IF EXISTS public.sync_child_vitals()                 CASCADE;
  DROP FUNCTION IF EXISTS public.handle_new_user()                   CASCADE;
  DROP FUNCTION IF EXISTS public.is_admin()                          CASCADE;
  DROP FUNCTION IF EXISTS public.has_role(text)                      CASCADE;
  DROP FUNCTION IF EXISTS public.current_user_role()                 CASCADE;
  DROP FUNCTION IF EXISTS public.current_user_role_id()              CASCADE;
  DROP FUNCTION IF EXISTS public.update_updated_at()                 CASCADE;
END;
$$;


-- ================================================================
-- [1] EXTENSIONES
-- ================================================================
CREATE EXTENSION IF NOT EXISTS vector;   -- pgvector: embeddings IA
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- Búsqueda fuzzy de texto


-- ================================================================
-- [2] FUNCIÓN BASE: update_updated_at
-- Sin dependencia de tablas → puede crearse primero.
-- ================================================================
CREATE FUNCTION public.update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- ================================================================
-- [3] ROLES — Tabla maestra de roles del sistema
-- ================================================================
CREATE TABLE public.roles (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX roles_name_unique ON public.roles (LOWER(name));

-- Seed (id ALWAYS IDENTITY: id=1→admin, id=2→parent)
INSERT INTO public.roles (name, description) VALUES
  ('admin',  'Dr. Trujillo — acceso total al sistema.'),
  ('parent', 'Padre/madre — acceso a sus hijos y datos propios.');

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

-- Todos los autenticados pueden leer los roles disponibles
CREATE POLICY roles_read ON public.roles
  FOR SELECT TO authenticated USING (true);


-- ================================================================
-- [4] PROFILES — Extiende auth.users de Supabase
-- Debe crearse ANTES de las funciones helper (que hacen JOIN aquí).
-- ================================================================
CREATE TABLE public.profiles (
  id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id     BIGINT      NOT NULL REFERENCES public.roles(id) DEFAULT 2, -- 2 = parent
  full_name   TEXT        NOT NULL DEFAULT '',
  email       TEXT        NOT NULL DEFAULT '',
  phone       TEXT,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX profiles_email_lower_idx ON public.profiles (LOWER(email));
CREATE INDEX        profiles_role_id_idx     ON public.profiles (role_id);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- ================================================================
-- [5] FUNCIONES HELPER DE ROL
-- profiles ya existe → LANGUAGE sql puede validar role_id.
-- ================================================================

-- ID del rol del usuario llamante
CREATE FUNCTION public.current_user_role_id()
RETURNS BIGINT LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public AS $$
  SELECT role_id FROM public.profiles WHERE id = auth.uid();
$$;

-- Nombre del rol del usuario llamante
CREATE FUNCTION public.current_user_role()
RETURNS TEXT LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public AS $$
  SELECT r.name
  FROM   public.profiles p
  JOIN   public.roles    r ON r.id = p.role_id
  WHERE  p.id = auth.uid();
$$;

-- ¿Tiene el usuario llamante exactamente este rol?
CREATE FUNCTION public.has_role(p_role_name TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.profiles p
    JOIN   public.roles    r ON r.id = p.role_id
    WHERE  p.id = auth.uid()
    AND    LOWER(r.name) = LOWER(p_role_name)
  );
$$;

-- Shorthand: ¿es admin?
CREATE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role('admin');
$$;


-- ================================================================
-- [6] RLS DE PROFILES (requiere is_admin() ya definida)
-- ================================================================
CREATE POLICY profiles_admin_all ON public.profiles
  FOR ALL TO authenticated
  USING (public.is_admin());

CREATE POLICY profiles_own_select ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY profiles_own_update ON public.profiles
  FOR UPDATE TO authenticated
  USING  (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    -- no puede escalarse el rol propio
    AND role_id = (SELECT role_id FROM public.profiles WHERE id = auth.uid())
  );


-- ================================================================
-- [7] TRIGGER: crear perfil automáticamente al registrarse
-- ================================================================
CREATE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role_id BIGINT;
BEGIN
  -- Busca el rol según el metadata que se pase en el registro
  SELECT id INTO v_role_id
  FROM   public.roles
  WHERE  LOWER(name) = LOWER(COALESCE(NEW.raw_user_meta_data->>'role', 'parent'));

  -- Fallback seguro si no existe ese rol
  IF v_role_id IS NULL THEN
    SELECT id INTO v_role_id FROM public.roles WHERE LOWER(name) = 'parent';
  END IF;

  INSERT INTO public.profiles (id, full_name, email, role_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.email, ''),
    v_role_id
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ================================================================
-- [8] CHILDREN
-- El estado de la suscripción se calcula leyendo las relaciones
-- ================================================================
CREATE TABLE public.children (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  full_name     TEXT        NOT NULL,
  date_of_birth DATE        NOT NULL,
  gender        TEXT        NOT NULL CHECK (gender IN ('male','female','other')),
  weight_kg     NUMERIC(5,2),   -- sincronizado por trigger desde vital_signs
  height_cm     NUMERIC(5,1),   -- sincronizado por trigger desde vital_signs
  photo_url     TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX children_parent_id_idx      ON public.children (parent_id);
CREATE INDEX children_full_name_trgm_idx ON public.children USING GIN (full_name gin_trgm_ops);
CREATE INDEX children_dob_idx            ON public.children (date_of_birth);

ALTER TABLE public.children ENABLE ROW LEVEL SECURITY;

CREATE POLICY children_admin_all     ON public.children FOR ALL    TO authenticated USING (public.is_admin());
CREATE POLICY children_parent_select ON public.children FOR SELECT TO authenticated USING (parent_id = auth.uid());
CREATE POLICY children_parent_insert ON public.children FOR INSERT TO authenticated WITH CHECK (parent_id = auth.uid());
CREATE POLICY children_parent_update ON public.children FOR UPDATE TO authenticated
  USING (parent_id = auth.uid()) WITH CHECK (parent_id = auth.uid());

CREATE TRIGGER children_updated_at
  BEFORE UPDATE ON public.children
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- ================================================================
-- [9] CLINICAL_RECORDS — Historias clínicas (Tradicional + SOAP)
-- ================================================================
CREATE TABLE public.clinical_records (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id        UUID        NOT NULL REFERENCES public.children(id)  ON DELETE CASCADE,
  created_by      UUID        NOT NULL REFERENCES public.profiles(id),
  record_type     TEXT        NOT NULL DEFAULT 'combined'
                              CHECK (record_type IN ('traditional','soap','combined')),

  -- Historia Clínica Tradicional Colombia
  chief_complaint TEXT,   -- 1. Motivo de consulta
  present_illness TEXT,   -- 2. Enfermedad actual
  medical_history TEXT,   -- 3. Antecedentes
  physical_exam   TEXT,   -- 4. Examen físico
  analysis        TEXT,   -- 5. Análisis
  diagnosis       TEXT,   -- 6. Diagnóstico
  medical_plan    TEXT,   -- 7. Plan / órdenes médicas

  -- SOAP
  subjective      TEXT,   -- S
  objective       TEXT,   -- O
  assessment      TEXT,   -- A
  plan            TEXT,   -- P

  extra_data      JSONB   NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(extra_data) = 'object'),
  is_vectorized   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX clinical_records_child_id_idx   ON public.clinical_records (child_id);
CREATE INDEX clinical_records_created_by_idx ON public.clinical_records (created_by);
CREATE INDEX clinical_records_child_date_idx ON public.clinical_records (child_id, created_at DESC);
CREATE INDEX clinical_records_pending_vec    ON public.clinical_records (is_vectorized) WHERE is_vectorized = FALSE;
CREATE INDEX clinical_records_extra_gin      ON public.clinical_records USING GIN (extra_data);

ALTER TABLE public.clinical_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY clinical_records_admin_all ON public.clinical_records
  FOR ALL TO authenticated USING (public.is_admin());

CREATE POLICY clinical_records_parent_select ON public.clinical_records
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.children c
    WHERE c.id = child_id AND c.parent_id = auth.uid()
  ));

CREATE TRIGGER clinical_records_updated_at
  BEFORE UPDATE ON public.clinical_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- ================================================================
-- [10] VITAL_SIGNS — Signos vitales por consulta (BMI auto-calculado)
-- ================================================================
CREATE TABLE public.vital_signs (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinical_record_id    UUID        NOT NULL REFERENCES public.clinical_records(id) ON DELETE CASCADE,
  child_id              UUID        NOT NULL REFERENCES public.children(id)          ON DELETE CASCADE,
  weight_kg             NUMERIC(5,2),
  height_cm             NUMERIC(5,1),
  temperature_c         NUMERIC(4,1),
  heart_rate            INTEGER,
  respiratory_rate      INTEGER,
  blood_pressure        TEXT,
  head_circumference_cm NUMERIC(5,1),
  oxygen_saturation     NUMERIC(4,1),
  bmi NUMERIC(5,2) GENERATED ALWAYS AS (
    CASE WHEN height_cm > 0 AND weight_kg > 0
         THEN ROUND(weight_kg / ((height_cm/100.0)*(height_cm/100.0)), 2)
         ELSE NULL END
  ) STORED,
  notes       TEXT,
  measured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX        vital_signs_record_idx     ON public.vital_signs (clinical_record_id);
CREATE INDEX        vital_signs_child_date_idx ON public.vital_signs (child_id, measured_at DESC);
CREATE UNIQUE INDEX vital_signs_record_unique  ON public.vital_signs (clinical_record_id);

ALTER TABLE public.vital_signs ENABLE ROW LEVEL SECURITY;

CREATE POLICY vital_signs_admin_all ON public.vital_signs
  FOR ALL TO authenticated USING (public.is_admin());

CREATE POLICY vital_signs_parent_select ON public.vital_signs
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.children c
    WHERE c.id = child_id AND c.parent_id = auth.uid()
  ));

-- Sincroniza peso/altura en children cada vez que se registran signos vitales
CREATE FUNCTION public.sync_child_vitals()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.children
  SET weight_kg  = COALESCE(NEW.weight_kg,  weight_kg),
      height_cm  = COALESCE(NEW.height_cm,  height_cm),
      updated_at = now()
  WHERE id = NEW.child_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_child_vitals_insert
  AFTER INSERT ON public.vital_signs
  FOR EACH ROW EXECUTE FUNCTION public.sync_child_vitals();

CREATE TRIGGER sync_child_vitals_update
  AFTER UPDATE ON public.vital_signs
  FOR EACH ROW EXECUTE FUNCTION public.sync_child_vitals();


-- ================================================================
-- [11] BLOG — Posts · Tags · Categorías · Recomendaciones
-- ================================================================
CREATE TABLE public.blog_posts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id       UUID        NOT NULL REFERENCES public.profiles(id),
  title           TEXT        NOT NULL,
  slug            TEXT        NOT NULL,
  excerpt         TEXT,
  content         TEXT        NOT NULL,
  cover_image_url TEXT,
  status          TEXT        NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft','published','archived')),
  ai_generated    BOOLEAN     NOT NULL DEFAULT FALSE,
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX blog_posts_slug_unique   ON public.blog_posts (slug);
CREATE INDEX        blog_posts_status_idx    ON public.blog_posts (status);
CREATE INDEX        blog_posts_pub_date_idx  ON public.blog_posts (published_at DESC) WHERE status='published';
CREATE INDEX        blog_posts_title_trgm    ON public.blog_posts USING GIN (title gin_trgm_ops);

ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY blog_posts_admin_all ON public.blog_posts FOR ALL TO authenticated USING (public.is_admin());
CREATE POLICY blog_posts_auth_read ON public.blog_posts FOR SELECT TO authenticated USING (status = 'published');

CREATE TRIGGER blog_posts_updated_at
  BEFORE UPDATE ON public.blog_posts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Tags
CREATE TABLE public.tags (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  slug       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX tags_slug_unique  ON public.tags (slug);
CREATE UNIQUE INDEX tags_name_unique  ON public.tags (LOWER(name));

CREATE TABLE public.post_tags (
  post_id UUID NOT NULL REFERENCES public.blog_posts(id) ON DELETE CASCADE,
  tag_id  UUID NOT NULL REFERENCES public.tags(id)       ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);
CREATE INDEX post_tags_tag_id_idx ON public.post_tags (tag_id);

ALTER TABLE public.tags      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY tags_auth_read     ON public.tags      FOR SELECT TO authenticated USING (true);
CREATE POLICY tags_admin_write   ON public.tags      FOR ALL    TO authenticated USING (public.is_admin());
CREATE POLICY post_tags_auth_read  ON public.post_tags FOR SELECT TO authenticated USING (true);
CREATE POLICY post_tags_admin_write ON public.post_tags FOR ALL  TO authenticated USING (public.is_admin());

-- Categorías con jerarquía padre-hijo
CREATE TABLE public.categories (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id   UUID        REFERENCES public.categories(id) ON DELETE SET NULL,
  name        TEXT        NOT NULL,
  slug        TEXT        NOT NULL,
  description TEXT,
  icon_url    TEXT,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX categories_slug_unique ON public.categories (slug);
CREATE UNIQUE INDEX categories_name_unique ON public.categories (LOWER(name));
CREATE INDEX        categories_parent_idx  ON public.categories (parent_id);
CREATE INDEX        categories_order_idx   ON public.categories (sort_order);

CREATE TABLE public.post_categories (
  post_id     UUID NOT NULL REFERENCES public.blog_posts(id)  ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.categories(id)  ON DELETE CASCADE,
  PRIMARY KEY (post_id, category_id)
);
CREATE INDEX post_categories_cat_idx ON public.post_categories (category_id);

ALTER TABLE public.categories      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY categories_auth_read       ON public.categories      FOR SELECT TO authenticated USING (true);
CREATE POLICY categories_admin_write     ON public.categories      FOR ALL    TO authenticated USING (public.is_admin());
CREATE POLICY post_categories_auth_read  ON public.post_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY post_categories_admin_write ON public.post_categories FOR ALL   TO authenticated USING (public.is_admin());

CREATE TRIGGER categories_updated_at
  BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Árbol recursivo de categorías
CREATE FUNCTION public.get_category_tree()
RETURNS TABLE(id UUID, parent_id UUID, name TEXT, slug TEXT,
              description TEXT, sort_order INT, depth INT)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH RECURSIVE tree AS (
    SELECT c.id, c.parent_id, c.name, c.slug, c.description, c.sort_order, 0 AS depth
      FROM public.categories c WHERE c.parent_id IS NULL
    UNION ALL
    SELECT c.id, c.parent_id, c.name, c.slug, c.description, c.sort_order, t.depth + 1
      FROM public.categories c JOIN tree t ON c.parent_id = t.id
  )
  SELECT * FROM tree ORDER BY depth, sort_order, name;
$$;

-- Posts recomendados a niños específicos
CREATE TABLE public.post_recommendations (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id        UUID        NOT NULL REFERENCES public.blog_posts(id) ON DELETE CASCADE,
  child_id       UUID        NOT NULL REFERENCES public.children(id)   ON DELETE CASCADE,
  recommended_by UUID        NOT NULL REFERENCES public.profiles(id),
  priority       INTEGER     NOT NULL DEFAULT 0,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX post_recs_unique  ON public.post_recommendations (post_id, child_id);
CREATE INDEX        post_recs_child   ON public.post_recommendations (child_id, priority DESC);

ALTER TABLE public.post_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY post_recs_admin_all ON public.post_recommendations FOR ALL TO authenticated USING (public.is_admin());
CREATE POLICY post_recs_parent_read ON public.post_recommendations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid()));


-- ================================================================
-- [12] SUBSCRIPTIONS — Mercado Pago
--      Cada niño tiene sus propias suscripciones.
-- ================================================================

CREATE TABLE public.subscription_statuses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insertar los estados principales
INSERT INTO public.subscription_statuses (name, description) VALUES 
  ('pending', 'Pendiente de pago o verificación'),
  ('active', 'Suscripción activa y al día'),
  ('expired', 'El periodo de suscripción ha terminado'),
  ('cancelled', 'Suscripción cancelada manualmente'),
  ('past_due', 'Retraso en el pago'),
  ('refunded', 'Pago reembolsado');

CREATE TABLE public.subscriptions (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id              UUID        NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  status_id             UUID        NOT NULL REFERENCES public.subscription_statuses(id),
  plan_name             TEXT        NOT NULL DEFAULT 'monthly',
  amount                NUMERIC(12,2) NOT NULL,
  currency              TEXT        NOT NULL DEFAULT 'COP',
  -- Mercado Pago
  mp_preference_id      TEXT,
  mp_payment_id         TEXT,
  mp_external_reference TEXT,
  mp_payer_email        TEXT,
  mp_payment_type       TEXT,
  mp_status_detail      TEXT,
  starts_at             TIMESTAMPTZ NOT NULL,
  ends_at               TIMESTAMPTZ NOT NULL,
  metadata              JSONB       NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(metadata)='object'),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sub_dates_check CHECK (starts_at < ends_at)
);

CREATE INDEX subscriptions_child_id_idx  ON public.subscriptions (child_id);
CREATE INDEX subscriptions_status_fk_idx ON public.subscriptions (status_id);
CREATE INDEX subscriptions_mp_payment    ON public.subscriptions (mp_payment_id)    WHERE mp_payment_id IS NOT NULL;
CREATE INDEX subscriptions_mp_ext_ref   ON public.subscriptions (mp_external_reference) WHERE mp_external_reference IS NOT NULL;

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY subscriptions_admin_all    ON public.subscriptions FOR ALL    TO authenticated USING (public.is_admin());
CREATE POLICY subscriptions_parent_read ON public.subscriptions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid()));

CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();




-- ================================================================
-- [13] CLINICAL_ATTACHMENTS
-- ================================================================
CREATE TABLE public.clinical_attachments (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinical_record_id UUID        NOT NULL REFERENCES public.clinical_records(id) ON DELETE CASCADE,
  uploaded_by        UUID        NOT NULL REFERENCES public.profiles(id),
  file_name          TEXT        NOT NULL,
  file_url           TEXT        NOT NULL,
  file_type          TEXT        NOT NULL,
  file_size_bytes    BIGINT,
  description        TEXT,
  attachment_type    TEXT        NOT NULL DEFAULT 'other'
                                CHECK (attachment_type IN ('lab_result','imaging','prescription','referral','other')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX clinical_attach_record_idx ON public.clinical_attachments (clinical_record_id);
CREATE INDEX clinical_attach_type_idx   ON public.clinical_attachments (attachment_type);

ALTER TABLE public.clinical_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY clinical_attach_admin_all ON public.clinical_attachments FOR ALL TO authenticated USING (public.is_admin());
CREATE POLICY clinical_attach_parent_read ON public.clinical_attachments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.clinical_records cr
    JOIN   public.children c ON c.id = cr.child_id
    WHERE  cr.id = clinical_record_id AND c.parent_id = auth.uid()
  ));


-- ================================================================
-- [14] VECTORS — Gemini text-embedding-004 (768 dims)
-- ================================================================

-- Embeddings de historias clínicas por niño
CREATE TABLE public.child_embeddings (
  id                 BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  child_id           UUID        NOT NULL REFERENCES public.children(id)         ON DELETE CASCADE,
  clinical_record_id UUID        REFERENCES public.clinical_records(id)          ON DELETE CASCADE,
  content            TEXT        NOT NULL,
  embedding          VECTOR(768) NOT NULL,
  metadata           JSONB       NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(metadata)='object'),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX child_emb_hnsw      ON public.child_embeddings USING hnsw (embedding vector_cosine_ops);
CREATE INDEX child_emb_child_idx ON public.child_embeddings (child_id);
CREATE INDEX child_emb_rec_idx   ON public.child_embeddings (clinical_record_id);
CREATE INDEX child_emb_meta_gin  ON public.child_embeddings USING GIN (metadata);

ALTER TABLE public.child_embeddings ENABLE ROW LEVEL SECURITY;
CREATE POLICY child_emb_admin_all    ON public.child_embeddings FOR ALL    TO authenticated USING (public.is_admin());
CREATE POLICY child_emb_parent_read  ON public.child_embeddings FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.children c WHERE c.id = child_id AND c.parent_id = auth.uid()));

-- Documentos del RAG (subidos por el doctor)
CREATE TABLE public.rag_documents (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by   UUID        NOT NULL REFERENCES public.profiles(id),
  title         TEXT        NOT NULL,
  description   TEXT,
  file_url      TEXT        NOT NULL,
  file_type     TEXT        NOT NULL CHECK (file_type IN ('pdf','docx','txt','md','url')),
  status        TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','processing','indexed','error')),
  page_count    INTEGER,
  error_message TEXT,
  metadata      JSONB       NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(metadata)='object'),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX rag_docs_status_idx  ON public.rag_documents (status);
CREATE INDEX rag_docs_uploader    ON public.rag_documents (uploaded_by);

CREATE TABLE public.rag_embeddings (
  id          BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id UUID        NOT NULL REFERENCES public.rag_documents(id) ON DELETE CASCADE,
  content     TEXT        NOT NULL,
  embedding   VECTOR(768) NOT NULL,
  chunk_index INTEGER     NOT NULL,
  metadata    JSONB       NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(metadata)='object'),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX rag_emb_hnsw    ON public.rag_embeddings USING hnsw (embedding vector_cosine_ops);
CREATE INDEX rag_emb_doc_idx ON public.rag_embeddings (document_id);
CREATE INDEX rag_emb_meta    ON public.rag_embeddings USING GIN (metadata);

ALTER TABLE public.rag_documents  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rag_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY rag_docs_admin_all  ON public.rag_documents  FOR ALL    TO authenticated USING (public.is_admin());
CREATE POLICY rag_emb_admin_all   ON public.rag_embeddings FOR ALL    TO authenticated USING (public.is_admin());
-- Todos los autenticados pueden leer embeddings del RAG (para el chatbot)
CREATE POLICY rag_emb_auth_read   ON public.rag_embeddings FOR SELECT TO authenticated USING (true);

CREATE TRIGGER rag_docs_updated_at
  BEFORE UPDATE ON public.rag_documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Búsqueda semántica en historias de un niño
CREATE FUNCTION public.search_child_embeddings(
  p_child_id UUID, p_query_embedding VECTOR(768),
  p_match_count INT DEFAULT 5, p_match_threshold FLOAT DEFAULT 0.6
)
RETURNS TABLE(id BIGINT, child_id UUID, clinical_record_id UUID,
              content TEXT, metadata JSONB, similarity FLOAT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT ce.id, ce.child_id, ce.clinical_record_id, ce.content, ce.metadata,
         (1-(ce.embedding<=>p_query_embedding))::FLOAT
  FROM public.child_embeddings ce
  WHERE ce.child_id = p_child_id
    AND (1-(ce.embedding<=>p_query_embedding)) >= p_match_threshold
  ORDER BY ce.embedding <=> p_query_embedding
  LIMIT p_match_count;
END;
$$;

-- Búsqueda semántica en documentos RAG
CREATE FUNCTION public.search_rag_embeddings(
  p_query_embedding VECTOR(768), p_match_count INT DEFAULT 5,
  p_match_threshold FLOAT DEFAULT 0.6, p_filter JSONB DEFAULT '{}'
)
RETURNS TABLE(id BIGINT, document_id UUID, content TEXT, metadata JSONB, similarity FLOAT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT re.id, re.document_id, re.content, re.metadata,
         (1-(re.embedding<=>p_query_embedding))::FLOAT
  FROM public.rag_embeddings re
  WHERE (1-(re.embedding<=>p_query_embedding)) >= p_match_threshold
    AND (p_filter = '{}'::JSONB OR re.metadata @> p_filter)
  ORDER BY re.embedding <=> p_query_embedding
  LIMIT p_match_count;
END;
$$;


-- ================================================================
-- [15] CHAT — Conversaciones del asistente IA con los padres
-- ================================================================
CREATE TABLE public.chat_conversations (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id   UUID        NOT NULL REFERENCES public.children(id)  ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES public.profiles(id)  ON DELETE CASCADE,
  title      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX chat_conv_child_idx     ON public.chat_conversations (child_id);
CREATE INDEX chat_conv_user_date_idx ON public.chat_conversations (user_id, updated_at DESC);

CREATE TABLE public.chat_messages (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID        NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  role            TEXT        NOT NULL CHECK (role IN ('user','assistant','system')),
  content         TEXT        NOT NULL,
  metadata        JSONB       NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(metadata)='object'),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX chat_msg_conv_date_idx ON public.chat_messages (conversation_id, created_at);

ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages      ENABLE ROW LEVEL SECURITY;

-- Doctor: solo LECTURA (monitoreo y soporte)
CREATE POLICY chat_conv_admin_read ON public.chat_conversations FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY chat_msg_admin_read  ON public.chat_messages      FOR SELECT TO authenticated USING (public.is_admin());

-- Padres: CRUD sobre sus propias conversaciones
CREATE POLICY chat_conv_own ON public.chat_conversations
  FOR ALL TO authenticated
  USING     (user_id = auth.uid())
  WITH CHECK(user_id = auth.uid());

CREATE POLICY chat_msg_own ON public.chat_messages
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.chat_conversations cc
    WHERE cc.id = conversation_id AND cc.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.chat_conversations cc
    WHERE cc.id = conversation_id AND cc.user_id = auth.uid()
  ));

CREATE TRIGGER chat_conv_updated_at
  BEFORE UPDATE ON public.chat_conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Toca updated_at de la conversación al insertar un nuevo mensaje
CREATE FUNCTION public.touch_conversation_on_message()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.chat_conversations SET updated_at = now()
  WHERE  id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER chat_msg_touch_conv
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_conversation_on_message();


-- ================================================================
-- [16] AUDIT_LOGS
-- ================================================================
CREATE TABLE public.audit_logs (
  id         BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  action     TEXT        NOT NULL,
  table_name TEXT        NOT NULL,
  record_id  UUID,
  old_data   JSONB,
  new_data   JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX audit_user_idx     ON public.audit_logs (user_id);
CREATE INDEX audit_table_idx    ON public.audit_logs (table_name, created_at DESC);
CREATE INDEX audit_record_idx   ON public.audit_logs (record_id);
CREATE INDEX audit_created_brin ON public.audit_logs USING BRIN (created_at);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_admin_only ON public.audit_logs FOR ALL TO authenticated USING (public.is_admin());

-- Auditoría automática de historias clínicas
CREATE FUNCTION public.audit_clinical_records()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF    TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs(user_id,action,table_name,record_id,new_data)
    VALUES(auth.uid(),'create','clinical_records',NEW.id,to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs(user_id,action,table_name,record_id,old_data,new_data)
    VALUES(auth.uid(),'update','clinical_records',NEW.id,to_jsonb(OLD),to_jsonb(NEW));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs(user_id,action,table_name,record_id,old_data)
    VALUES(auth.uid(),'delete','clinical_records',OLD.id,to_jsonb(OLD));
  END IF;
  RETURN COALESCE(NEW,OLD);
END;
$$;

CREATE TRIGGER audit_clinical_records_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.clinical_records
  FOR EACH ROW EXECUTE FUNCTION public.audit_clinical_records();


-- ================================================================
-- FIN — 19 tablas · 1 vista · 13 funciones
-- roles · profiles · children · clinical_records · vital_signs
-- blog_posts · tags · post_tags · categories · post_categories
-- post_recommendations · subscriptions · clinical_attachments
-- child_embeddings · rag_documents · rag_embeddings
-- chat_conversations · chat_messages · audit_logs
-- ================================================================
