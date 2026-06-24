import { createClient } from 'npm:@supabase/supabase-js@2';

type Reservation = {
  sync_uuid: string;
  customer_name?: string | null;
  session_type?: string | null;
  schedule_local?: string | null;
  date_start_local?: string | null;
  photographer_name?: string | null;
  state?: string | null;
  active?: boolean | null;
};

type WebhookPayload = {
  type?: string;
  table?: string;
  record?: Reservation;
  event?: string;
  force?: boolean;
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const expoAccessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
const supabase = createClient(supabaseUrl, serviceRoleKey);

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Metodo no permitido' }, { status: 405 });
  }

  if (request.headers.get('Authorization') !== `Bearer ${serviceRoleKey}`) {
    return Response.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const payload = (await request.json()) as WebhookPayload;

    if (payload.event === 'tomorrow_summary') {
      return await notifyTomorrow(payload.force === true);
    }

    if (
      payload.type === 'INSERT' &&
      payload.table === 'lafoteria_reservations' &&
      payload.record
    ) {
      return await notifyNewReservation(payload.record);
    }

    return Response.json({ ignored: true });
  } catch (error) {
    console.error(error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
});

async function notifyNewReservation(reservation: Reservation) {
  if (reservation.active === false || reservation.state === 'cancelled') {
    return Response.json({ ignored: true });
  }

  const details = [
    reservation.customer_name || 'Cliente',
    reservation.schedule_local || localTime(reservation.date_start_local),
    reservation.session_type || 'Sesion fotografica',
  ].filter(Boolean);

  const result = await sendToAllDevices({
    title: 'Nueva reserva',
    body: details.join(' · '),
    data: {
      event: 'new_reservation',
      reservation_uuid: reservation.sync_uuid,
      reservation_date: reservation.date_start_local?.slice(0, 10) || '',
    },
  });

  return Response.json(result);
}

async function notifyTomorrow(force: boolean) {
  const localNow = havanaParts(new Date());
  if (!force && localNow.hour !== 18) {
    return Response.json({
      ignored: true,
      reason: 'Fuera del horario diario de las 18:00 America/Havana',
    });
  }

  const tomorrow = addDays(localNow.date, 1);
  const dayAfterTomorrow = addDays(localNow.date, 2);

  const { data: existingLog } = await supabase
    .from('lafoteria_notification_log')
    .select('event_type')
    .eq('event_type', 'tomorrow_summary')
    .eq('event_date', tomorrow)
    .maybeSingle();

  if (existingLog && !force) {
    return Response.json({ ignored: true, reason: 'Resumen ya enviado' });
  }

  const { data, error } = await supabase
    .from('lafoteria_reservations')
    .select(
      'sync_uuid,customer_name,session_type,schedule_local,date_start_local,photographer_name,state,active',
    )
    .gte('date_start_local', `${tomorrow} 00:00:00`)
    .lt('date_start_local', `${dayAfterTomorrow} 00:00:00`)
    .order('date_start_local', { ascending: true });

  if (error) {
    throw error;
  }

  const reservations = ((data || []) as Reservation[]).filter(
    (item) => item.active !== false && item.state !== 'cancelled',
  );

  const title = reservations.length
    ? `${reservations.length} ${reservations.length === 1 ? 'reserva' : 'reservas'} para mañana`
    : 'Agenda de mañana';
  const body = reservations.length
    ? reservations
        .slice(0, 4)
        .map(
          (item) =>
            `${item.schedule_local || localTime(item.date_start_local)} ${item.customer_name || 'Cliente'}`,
        )
        .join(' · ')
    : 'No hay reservas para mañana';

  const result = await sendToAllDevices({
    title,
    body,
    data: {
      event: 'tomorrow_summary',
      reservation_date: tomorrow,
      reservation_count: reservations.length,
    },
  });

  if (result.recipientCount > 0) {
    await supabase.from('lafoteria_notification_log').upsert({
      event_type: 'tomorrow_summary',
      event_date: tomorrow,
      recipient_count: result.recipientCount,
      payload: { title, body, reservation_count: reservations.length },
      sent_at: new Date().toISOString(),
    });
  }

  return Response.json(result);
}

async function sendToAllDevices(notification: {
  title: string;
  body: string;
  data: Record<string, unknown>;
}) {
  const { data: tokenRows, error } = await supabase
    .from('lafoteria_push_tokens')
    .select('expo_push_token')
    .eq('active', true);

  if (error) {
    throw error;
  }

  const tokens = (tokenRows || []).map((item) => item.expo_push_token);
  if (!tokens.length) {
    return { recipientCount: 0, tickets: [] };
  }

  const tickets: unknown[] = [];
  for (let index = 0; index < tokens.length; index += 100) {
    const tokenChunk = tokens.slice(index, index + 100);
    const messages = tokenChunk.map((token) => ({
      to: token,
      sound: 'default',
      channelId: 'reservas',
      priority: 'high',
      title: notification.title,
      body: notification.body,
      data: notification.data,
    }));

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    };
    if (expoAccessToken) {
      headers.Authorization = `Bearer ${expoAccessToken}`;
    }

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers,
      body: JSON.stringify(messages),
    });
    const responseBody = await response.json();
    if (!response.ok) {
      throw new Error(JSON.stringify(responseBody));
    }
    tickets.push(responseBody);

    const ticketData = Array.isArray(responseBody.data)
      ? responseBody.data
      : [responseBody.data];
    for (let offset = 0; offset < ticketData.length; offset += 1) {
      if (ticketData[offset]?.details?.error === 'DeviceNotRegistered') {
        await supabase
          .from('lafoteria_push_tokens')
          .update({ active: false, updated_at: new Date().toISOString() })
          .eq('expo_push_token', tokenChunk[offset]);
      }
    }
  }

  return { recipientCount: tokens.length, tickets };
}

function havanaParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Havana',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    hour: Number(values.hour),
  };
}

function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function localTime(value?: string | null) {
  return value?.slice(11, 16) || 'Sin horario';
}
