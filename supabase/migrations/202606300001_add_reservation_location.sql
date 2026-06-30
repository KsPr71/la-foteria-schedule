alter table public.lafoteria_reservations
    add column if not exists location text not null default 'studio';

update public.lafoteria_reservations
   set location = 'studio'
 where location is null
    or location not in ('studio', 'outdoors');

alter table public.lafoteria_reservations
    drop constraint if exists lafoteria_reservations_location_check;

alter table public.lafoteria_reservations
    add constraint lafoteria_reservations_location_check
    check (location in ('studio', 'outdoors'));
