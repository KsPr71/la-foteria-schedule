create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists supabase_vault with schema vault;

create table if not exists public.lafoteria_push_tokens (
    expo_push_token text primary key,
    platform text not null default 'android',
    device_name text,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.lafoteria_push_tokens enable row level security;

create or replace function public.register_lafoteria_push_token(
    p_expo_push_token text,
    p_platform text default 'android',
    p_device_name text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if p_expo_push_token is null
       or (
           p_expo_push_token not like 'ExponentPushToken[%'
           and p_expo_push_token not like 'ExpoPushToken[%'
       ) then
        raise exception 'Token Expo no valido';
    end if;

    insert into public.lafoteria_push_tokens (
        expo_push_token, platform, device_name, active, updated_at
    )
    values (
        p_expo_push_token,
        coalesce(nullif(p_platform, ''), 'android'),
        nullif(p_device_name, ''),
        true,
        now()
    )
    on conflict (expo_push_token) do update
    set platform = excluded.platform,
        device_name = excluded.device_name,
        active = true,
        updated_at = now();
end;
$$;

revoke all on function public.register_lafoteria_push_token(text, text, text) from public;
grant execute on function public.register_lafoteria_push_token(text, text, text) to anon, authenticated;

create table if not exists public.lafoteria_notification_log (
    event_type text not null,
    event_date date not null,
    sent_at timestamptz not null default now(),
    recipient_count integer not null default 0,
    payload jsonb,
    primary key (event_type, event_date)
);

alter table public.lafoteria_notification_log enable row level security;

create or replace function public.lafoteria_notify_new_reservation()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    project_url text;
    service_role_key text;
begin
    select decrypted_secret into project_url
      from vault.decrypted_secrets
     where name = 'project_url'
     limit 1;

    select decrypted_secret into service_role_key
      from vault.decrypted_secrets
     where name = 'service_role_key'
     limit 1;

    if project_url is null or service_role_key is null then
        return new;
    end if;

    perform net.http_post(
        url := rtrim(project_url, '/') || '/functions/v1/lafoteria-notifications',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || service_role_key
        ),
        body := jsonb_build_object(
            'type', 'INSERT',
            'table', tg_table_name,
            'schema', tg_table_schema,
            'record', to_jsonb(new)
        )
    );

    return new;
end;
$$;

drop trigger if exists lafoteria_reservation_insert_push
    on public.lafoteria_reservations;

create trigger lafoteria_reservation_insert_push
after insert on public.lafoteria_reservations
for each row
execute function public.lafoteria_notify_new_reservation();

do $$
declare
    existing_job_id bigint;
begin
    select jobid into existing_job_id
      from cron.job
     where jobname = 'lafoteria-tomorrow-reservations'
     limit 1;

    if existing_job_id is not null then
        perform cron.unschedule(existing_job_id);
    end if;
end;
$$;

select cron.schedule(
    'lafoteria-tomorrow-reservations',
    '0 * * * *',
    $cron$
    select net.http_post(
        url := rtrim(
            (select decrypted_secret
               from vault.decrypted_secrets
              where name = 'project_url'
              limit 1),
            '/'
        ) || '/functions/v1/lafoteria-notifications',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (
                select decrypted_secret
                  from vault.decrypted_secrets
                 where name = 'service_role_key'
                 limit 1
            )
        ),
        body := '{"event":"tomorrow_summary"}'::jsonb
    )
    where exists (
        select 1 from vault.decrypted_secrets where name = 'project_url'
    )
    and exists (
        select 1 from vault.decrypted_secrets where name = 'service_role_key'
    );
    $cron$
);
