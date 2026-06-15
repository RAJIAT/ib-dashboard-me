
-- 1) Agents table: restrict SELECT to admin / own row / supervisor
DROP POLICY IF EXISTS "Authenticated read active agents" ON public.agents;

CREATE POLICY "Agents readable by admin, owner, supervisor"
ON public.agents
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR user_id = auth.uid()
  OR supervisor_user_id = auth.uid()
);

-- 2) Storage: request-docs — replace broad INSERT policy with ownership-scoped one
DROP POLICY IF EXISTS "Authenticated upload to request-docs" ON storage.objects;

CREATE POLICY "Agents upload to own request-docs"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'request-docs'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1
      FROM public.requests r
      JOIN public.agents a ON a.id = r.agent_id
      WHERE a.user_id = auth.uid()
        AND r.id::text = (storage.foldername(name))[1]
    )
  )
);

-- 3) Storage: fix broken SELECT join logic for agents reading their request docs
DROP POLICY IF EXISTS "Agents read own request docs" ON storage.objects;

CREATE POLICY "Agents read own request docs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'request-docs'
  AND EXISTS (
    SELECT 1
    FROM public.requests r
    JOIN public.agents a ON a.id = r.agent_id
    WHERE a.user_id = auth.uid()
      AND r.id::text = (storage.foldername(name))[1]
  )
);

-- 4) Storage: explicit restrictive UPDATE / DELETE policies on chat-attachments
CREATE POLICY "Admins delete chat attachments"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins update chat attachments"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  bucket_id = 'chat-attachments'
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- 5) Lock down SECURITY DEFINER helpers from anon
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_thread_participant(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_thread_participant(uuid, uuid) TO authenticated;
