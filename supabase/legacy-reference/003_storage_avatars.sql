-- ============================================================
-- 003_storage_avatars.sql
-- Creación del Bucket de Storage para avatares y configuración RLS
-- ============================================================

-- Intentar crear el bucket solo si no existe
INSERT INTO storage.buckets (id, name, public) 
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Configuracion de políticas RLS para el Bucket 'avatars'

-- Permitir a cualquier persona LEER los avatares públicos
CREATE POLICY "Avatar images are publicly accessible"
ON storage.objects FOR SELECT
USING ( bucket_id = 'avatars' );

-- Permitir a usuarios autenticados SUBIR imágenes a la carpeta de su usuario
-- Usamos auth.uid() para crear carpetas dinámicas por usuario
CREATE POLICY "Authenticated users can upload avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars' AND 
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Permitir a los usuarios EDITAR/SOBRESCRIBIR sus propios avatares
CREATE POLICY "Users can update their own avatars"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars' AND 
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Permitir a los administradores borrar cualquier avatar (si es necesario por moderación)
CREATE POLICY "Admins can delete avatars"
ON storage.objects FOR DELETE
TO authenticated
USING ( public.is_admin() );

-- Permitir al mismo usuario borrar su propia foto
CREATE POLICY "Users can delete their own avatars"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars' AND 
  (storage.foldername(name))[1] = auth.uid()::text
);
