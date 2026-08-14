-- ============================================================
-- 006_blog.sql
-- Blog: posts, tags, categorías y recomendaciones por niño
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- Tabla: blog_posts
-- ────────────────────────────────────────────────────────────
CREATE TABLE public.blog_posts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id       UUID NOT NULL REFERENCES public.profiles(id),
  title           TEXT NOT NULL,
  slug            TEXT NOT NULL,
  excerpt         TEXT,                     -- Resumen corto (para cards del blog)
  content         TEXT NOT NULL,            -- Contenido completo (Markdown)
  cover_image_url TEXT,
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'published', 'archived')),
  ai_generated    BOOLEAN NOT NULL DEFAULT FALSE,
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE UNIQUE INDEX blog_posts_slug_unique ON public.blog_posts (slug);
CREATE INDEX blog_posts_author_id_idx ON public.blog_posts (author_id);
CREATE INDEX blog_posts_status_idx ON public.blog_posts (status);
CREATE INDEX blog_posts_published_at_idx ON public.blog_posts (published_at DESC)
  WHERE status = 'published';
CREATE INDEX blog_posts_title_trgm_idx ON public.blog_posts USING GIN (title gin_trgm_ops);

-- RLS
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

-- Admin: acceso total
CREATE POLICY blog_posts_admin_all ON public.blog_posts
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Users autenticados: solo lectura de posts publicados
CREATE POLICY blog_posts_authenticated_read ON public.blog_posts
  FOR SELECT TO authenticated
  USING (status = 'published');

-- Trigger updated_at
CREATE TRIGGER blog_posts_updated_at
  BEFORE UPDATE ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ────────────────────────────────────────────────────────────
-- Tabla: tags
-- ────────────────────────────────────────────────────────────
CREATE TABLE public.tags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX tags_slug_unique ON public.tags (slug);
CREATE UNIQUE INDEX tags_name_lower_unique ON public.tags (LOWER(name));

-- Table pivot: post_tags
CREATE TABLE public.post_tags (
  post_id  UUID NOT NULL REFERENCES public.blog_posts(id) ON DELETE CASCADE,
  tag_id   UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

CREATE INDEX post_tags_tag_id_idx ON public.post_tags (tag_id);

-- RLS tags
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY tags_authenticated_read ON public.tags
  FOR SELECT TO authenticated USING (true);

CREATE POLICY tags_admin_write ON public.tags
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY post_tags_authenticated_read ON public.post_tags
  FOR SELECT TO authenticated USING (true);

CREATE POLICY post_tags_admin_write ON public.post_tags
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ────────────────────────────────────────────────────────────
-- Tabla: categories (con jerarquía padre-hijo)
-- ────────────────────────────────────────────────────────────
CREATE TABLE public.categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id   UUID REFERENCES public.categories(id) ON DELETE SET NULL, -- NULL = categoría raíz
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  description TEXT,
  icon_url    TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX categories_slug_unique ON public.categories (slug);
CREATE UNIQUE INDEX categories_name_lower_unique ON public.categories (LOWER(name));
CREATE INDEX categories_parent_id_idx ON public.categories (parent_id);
CREATE INDEX categories_sort_order_idx ON public.categories (sort_order);

-- Tabla pivot: post_categories
CREATE TABLE public.post_categories (
  post_id     UUID NOT NULL REFERENCES public.blog_posts(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, category_id)
);

CREATE INDEX post_categories_category_id_idx ON public.post_categories (category_id);

-- RLS categories
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY categories_authenticated_read ON public.categories
  FOR SELECT TO authenticated USING (true);

CREATE POLICY categories_admin_write ON public.categories
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY post_categories_authenticated_read ON public.post_categories
  FOR SELECT TO authenticated USING (true);

CREATE POLICY post_categories_admin_write ON public.post_categories
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Trigger updated_at para categories
CREATE TRIGGER categories_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ────────────────────────────────────────────────────────────
-- Tabla: post_recommendations (posts recomendados a niños)
-- ────────────────────────────────────────────────────────────
CREATE TABLE public.post_recommendations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id         UUID NOT NULL REFERENCES public.blog_posts(id) ON DELETE CASCADE,
  child_id        UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  recommended_by  UUID NOT NULL REFERENCES public.profiles(id),
  priority        INTEGER NOT NULL DEFAULT 0,  -- Mayor prioridad = aparece primero en la app
  notes           TEXT,                        -- Nota del doctor sobre por qué recomienda
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No se puede recomendar el mismo post al mismo niño dos veces
CREATE UNIQUE INDEX post_recommendations_unique ON public.post_recommendations (post_id, child_id);
CREATE INDEX post_recommendations_child_idx ON public.post_recommendations (child_id);
CREATE INDEX post_recommendations_post_idx ON public.post_recommendations (post_id);
CREATE INDEX post_recommendations_priority_idx ON public.post_recommendations (child_id, priority DESC);

-- RLS
ALTER TABLE public.post_recommendations ENABLE ROW LEVEL SECURITY;

-- Admin: acceso total
CREATE POLICY post_recs_admin_all ON public.post_recommendations
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Padres: ver recomendaciones de sus hijos
CREATE POLICY post_recs_parent_select ON public.post_recommendations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.children
      WHERE children.id = post_recommendations.child_id
        AND children.parent_id = auth.uid()
    )
  );

-- ────────────────────────────────────────────────────────────
-- Función: árbol de categorías (CTE recursivo)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_category_tree()
RETURNS TABLE (
  id          UUID,
  parent_id   UUID,
  name        TEXT,
  slug        TEXT,
  description TEXT,
  sort_order  INTEGER,
  depth       INTEGER
)
LANGUAGE SQL
STABLE
SECURITY INVOKER SET search_path = public
AS $$
  WITH RECURSIVE category_tree AS (
    -- Categorías raíz
    SELECT
      c.id, c.parent_id, c.name, c.slug, c.description, c.sort_order,
      0 AS depth
    FROM public.categories c
    WHERE c.parent_id IS NULL

    UNION ALL

    -- Hijos
    SELECT
      c.id, c.parent_id, c.name, c.slug, c.description, c.sort_order,
      ct.depth + 1
    FROM public.categories c
    JOIN category_tree ct ON c.parent_id = ct.id
  )
  SELECT * FROM category_tree ORDER BY depth, sort_order, name;
$$;
