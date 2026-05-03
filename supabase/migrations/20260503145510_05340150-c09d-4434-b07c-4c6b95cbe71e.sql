-- Tighten agents RLS: remove anon access (table is unused on client; everything goes through Directus)
DROP POLICY IF EXISTS "Anyone reads active agents" ON public.agents;
CREATE POLICY "Authenticated read active agents"
ON public.agents
FOR SELECT
TO authenticated
USING (active = true OR has_role(auth.uid(), 'admin'::app_role));

-- Tighten storage bucket request-docs: drop anonymous unrestricted upload
DROP POLICY IF EXISTS "Public upload to request-docs" ON storage.objects;
CREATE POLICY "Authenticated upload to request-docs"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'request-docs');