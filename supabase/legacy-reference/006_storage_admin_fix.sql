-- ============================================================
-- 006_storage_admin_fix.sql
-- Política RLS para permitir a los DOCTORES/ADMINS subir fotos
-- sin estar restringidos a su propia carpeta de Auth ID.
-- ============================================================

CREATE POLICY "Admins can insert avatars anywhere" 
ON storage.objects FOR INSERT 
TO authenticated 
WITH CHECK ( bucket_id = 'avatars' AND public.is_admin() );

CREATE POLICY "Admins can update avatars anywhere" 
ON storage.objects FOR UPDATE 
TO authenticated 
USING ( bucket_id = 'avatars' AND public.is_admin() );
