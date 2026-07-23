CREATE TABLE public.vouchers (
  code text PRIMARY KEY,
  discount_percent integer NOT NULL CHECK (discount_percent > 0 AND discount_percent <= 100),
  valid_until timestamp with time zone,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);

-- Turn on Row Level Security
ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;

-- Allow anyone (authenticated or not) to read active vouchers for validation
CREATE POLICY "Allow public read access to vouchers" ON public.vouchers
  FOR SELECT USING (true);

-- Allow only admins (service role) to insert/update vouchers
-- You can add vouchers manually via Supabase Dashboard -> Table Editor -> vouchers -> Insert row
