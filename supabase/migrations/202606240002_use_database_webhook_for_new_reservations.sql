-- New-reservation notifications are delivered through a Supabase Database
-- Webhook configured in the Dashboard. Remove the legacy custom trigger to
-- prevent duplicate notifications if both mechanisms are present.
drop trigger if exists lafoteria_reservation_insert_push
    on public.lafoteria_reservations;
