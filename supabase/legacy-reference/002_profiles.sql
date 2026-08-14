-- ============================================================
-- 002_roles_and_profiles.sql
-- Sistema de roles normalizado + tabla profiles
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- Tabla: roles
-- Tabla maestra de roles del sistema
-- ────────────────────────────────────────────────────────────
CREATE TABLE public.roles (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX roles_name_unique ON public.roles (LOWER(name));

-- Seed inicial de roles
INSERT INTO public.roles (name, description) VALUES
  ('admin',  'Administrador del sistema — Dr. Trujillo. Acceso total.'),
  ('parent', 'Padre o madre. Acceso a sus hijos y datos propios.');

-- RLS: todos los autenticados pueden consultar los roles
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY roles_authenticated_read ON public.roles
  FOR SELECT TO authenticated USING (true);

-- ────────────────────────────────────────────────────────────
-- Funciones helper de roles
-- Usadas en todas las políticas RLS para evitar repetición.
-- STABLE = el planner las cachea dentro de la misma transacción.
-- ────────────────────────────────────────────────────────────

-- ID del rol del usuario actual
CREATE OR REPLACE FUNCTION public.current_user_role_id()
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT role_id FROM public.profiles WHERE id = auth.uid();
$$;

-- Nombre del rol del usuario actual
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT r.name
  FROM public.profiles p
  JOIN public.roles r ON r.id = p.role_id
  WHERE p.id = auth.uid();
$$;

-- Comprueba si el usuario actual tiene un rol específico
CREATE OR REPLACE FUNCTION public.has_role(p_role_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.roles r ON r.id = p.role_id
    WHERE p.id = auth.uid()
      AND LOWER(r.name) = LOWER(p_role_name)
  );
$$;

-- Shorthand: ¿es el usuario actual admin?
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role('admin');
$$;

-- ────────────────────────────────────────────────────────────
-- Tabla: profiles
-- ────────────────────────────────────────────────────────────
CREATE TABLE public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id     BIGINT NOT NULL REFERENCES public.roles(id) DEFAULT 2,
                -- DEFAULT 2 = 'parent' (segundo registro del seed)
  full_name   TEXT NOT NULL DEFAULT '',
  email       TEXT NOT NULL DEFAULT '',
  phone       TEXT,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX profiles_email_lower_idx ON public.profiles (LOWER(email));
CREATE INDEX profiles_role_id_idx ON public.profiles (role_id);

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Admin: acceso total a todos los perfiles
CREATE POLICY profiles_admin_all ON public.profiles
  FOR ALL TO authenticated
  USING (public.is_admin());

-- Cada usuario puede leer su propio perfil
CREATE POLICY profiles_own_select ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- Cada usuario puede actualizar su propio perfil (sin poder cambiar su role_id)
CREATE POLICY profiles_own_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role_id = (SELECT role_id FROM public.profiles WHERE id = auth.uid())
  );

-- Trigger: updated_at
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ────────────────────────────────────────────────────────────
-- Trigger: auto-crear perfil al registrarse en Supabase Auth
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role_id BIGINT;
BEGIN
  -- Busca el rol según metadata enviada en el registro
  SELECT id INTO v_role_id
  FROM public.roles
  WHERE LOWER(name) = LOWER(COALESCE(NEW.raw_user_meta_data ->> 'role', 'parent'));

  -- Si no se encuentra, usar 'parent' por defecto (seguro)
  IF v_role_id IS NULL THEN
    SELECT id INTO v_role_id FROM public.roles WHERE LOWER(name) = 'parent';
  END IF;

  INSERT INTO public.profiles (id, full_name, email, role_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
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
