-- =========================================================
-- 1. ROLES (separate table, secured via has_role function)
-- =========================================================
CREATE TYPE public.app_role AS ENUM ('admin', 'agent');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users read own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins manage roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- 2. AGENTS (directory, managed by admins)
-- =========================================================
CREATE TABLE public.agents (
  id TEXT PRIMARY KEY,                   -- business agent_id (e.g. A123)
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT,
  branch TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

-- Public can read active agents (so customer upload page can resolve agent)
CREATE POLICY "Anyone reads active agents"
  ON public.agents FOR SELECT
  TO anon, authenticated
  USING (active = TRUE OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage agents"
  ON public.agents FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- 3. REQUESTS
-- =========================================================
CREATE TYPE public.request_status AS ENUM ('new', 'processing', 'sold', 'rejected', 'reupload');

CREATE TABLE public.requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id TEXT UNIQUE,                -- e.g. REQ-1001
  agent_id TEXT REFERENCES public.agents(id) ON DELETE SET NULL,
  agent_name TEXT,
  branch TEXT,
  status request_status NOT NULL DEFAULT 'new',
  customer_name TEXT,
  customer_email TEXT,
  registration TEXT,                     -- storage path
  license TEXT,
  emirates TEXT,
  passport TEXT,                         -- optional
  vehicle_photos TEXT[] DEFAULT '{}',    -- array of storage paths
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;

-- Anyone can submit (customers without login)
CREATE POLICY "Anyone can create a request"
  ON public.requests FOR INSERT
  TO anon, authenticated
  WITH CHECK (TRUE);

-- Admins see everything
CREATE POLICY "Admins view all requests"
  ON public.requests FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Agents see only their own
CREATE POLICY "Agents view own requests"
  ON public.requests FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'agent')
    AND agent_id IN (SELECT id FROM public.agents WHERE user_id = auth.uid())
  );

-- Admins update any
CREATE POLICY "Admins update requests"
  ON public.requests FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Agents update own
CREATE POLICY "Agents update own requests"
  ON public.requests FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'agent')
    AND agent_id IN (SELECT id FROM public.agents WHERE user_id = auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'agent')
    AND agent_id IN (SELECT id FROM public.agents WHERE user_id = auth.uid())
  );

CREATE POLICY "Admins delete requests"
  ON public.requests FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Auto display_id sequence
CREATE SEQUENCE public.requests_display_seq START 1001;

CREATE OR REPLACE FUNCTION public.set_request_display_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.display_id IS NULL THEN
    NEW.display_id := 'REQ-' || nextval('public.requests_display_seq');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_requests_display_id
  BEFORE INSERT ON public.requests
  FOR EACH ROW EXECUTE FUNCTION public.set_request_display_id();

-- updated_at trigger (shared)
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_requests_updated
  BEFORE UPDATE ON public.requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_agents_updated
  BEFORE UPDATE ON public.agents
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Indexes
CREATE INDEX idx_requests_agent_id ON public.requests(agent_id);
CREATE INDEX idx_requests_status ON public.requests(status);
CREATE INDEX idx_requests_created ON public.requests(created_at DESC);

-- =========================================================
-- 4. STORAGE BUCKET (private — uploads use signed URLs)
-- =========================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('request-docs', 'request-docs', FALSE)
ON CONFLICT (id) DO NOTHING;

-- Anyone (anon) can upload to this bucket (customer flow)
CREATE POLICY "Public upload to request-docs"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'request-docs');

-- Admins read everything
CREATE POLICY "Admins read request-docs"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'request-docs' AND public.has_role(auth.uid(), 'admin'));

-- Agents read their request files (any file linked to a request they own)
CREATE POLICY "Agents read own request docs"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'request-docs'
    AND public.has_role(auth.uid(), 'agent')
    AND EXISTS (
      SELECT 1 FROM public.requests r
      JOIN public.agents a ON a.id = r.agent_id
      WHERE a.user_id = auth.uid()
        AND (
          r.registration = name OR r.license = name OR r.emirates = name
          OR r.passport = name OR name = ANY(r.vehicle_photos)
        )
    )
  );

CREATE POLICY "Admins manage request-docs"
  ON storage.objects FOR ALL
  TO authenticated
  USING (bucket_id = 'request-docs' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'request-docs' AND public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- 5. Auto-assign role on signup (default: agent)
-- =========================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'agent')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();