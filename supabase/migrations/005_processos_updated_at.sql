alter table public.processos
add column if not exists updated_at timestamp without time zone default now();

create index if not exists processos_updated_at_idx
on public.processos (updated_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_processos_updated_at on public.processos;
create trigger set_processos_updated_at
before update on public.processos
for each row
execute function public.set_updated_at();

