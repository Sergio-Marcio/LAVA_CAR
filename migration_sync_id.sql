ALTER TABLE public.processos ADD COLUMN IF NOT EXISTS sync_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS processos_sync_id_key ON public.processos (sync_id);
