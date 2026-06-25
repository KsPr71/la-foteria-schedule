import { getCachedRows, getLastCachedUpdate, upsertCachedRows } from './localCache';
import { insertRow, makeUuid, readTable, updateRow } from './supabase';

export type Client = {
  sync_uuid: string;
  name: string;
  phone?: string | null;
  birthdate?: string | null;
  active?: boolean | null;
  updated_at?: string | null;
};

export type SessionType = {
  sync_uuid: string;
  name: string;
  duration_hours?: number | null;
  color?: number | null;
  active?: boolean | null;
};

export type Photographer = {
  sync_uuid: string;
  name: string;
  active?: boolean | null;
};

export type Reservation = {
  sync_uuid: string;
  partner_uuid?: string | null;
  customer_name: string;
  phone?: string | null;
  birthdate?: string | null;
  session_type_uuid?: string | null;
  session_type?: string | null;
  duration_hours?: number | null;
  date_start?: string | null;
  date_stop?: string | null;
  date_start_local?: string | null;
  date_stop_local?: string | null;
  schedule_local?: string | null;
  timezone?: string | null;
  photographer_uuid?: string | null;
  photographer_name?: string | null;
  advance_amount?: number | null;
  advance_payment_method?: string | null;
  state?: string | null;
  note?: string | null;
  active?: boolean | null;
  updated_at?: string | null;
};

export type ReservationForm = {
  sync_uuid?: string;
  partner_uuid?: string;
  customer_name: string;
  phone: string;
  birthdate: string;
  session_type_uuid: string;
  session_type: string;
  duration_hours: string;
  date: string;
  time: string;
  photographer_uuid: string;
  photographer_name: string;
  advance_amount: string;
  advance_payment_method: string;
  note: string;
};

export async function loadScheduleData() {
  const [reservations, remoteClients, sessionTypes, photographers] = await Promise.all([
    syncTable<Reservation>('lafoteria_reservations', {
      select: '*',
      order: 'date_start_local.asc',
    }),
    syncTable<Client>('lafoteria_clients', {
      select: '*',
      order: 'name.asc',
    }),
    syncTable<SessionType>('lafoteria_session_types', {
      select: '*',
      order: 'sequence.asc,name.asc',
    }),
    syncTable<Photographer>('lafoteria_photographers', {
      select: '*',
      order: 'name.asc',
    }),
  ]);

  const activeReservations = reservations
      .filter((item) => item.state !== 'cancelled' && item.active !== false)
      .sort((a, b) => dateTimeSortValue(a).localeCompare(dateTimeSortValue(b)));
  const clients = mergeClientsWithReservations(
    deduplicateClients(remoteClients, activeReservations),
    activeReservations,
  );

  return {
    reservations: activeReservations,
    clients: clients.filter((item) => item.active !== false).sort((a, b) => a.name.localeCompare(b.name)),
    sessionTypes: sessionTypes.filter((item) => item.active !== false).sort((a, b) => a.name.localeCompare(b.name)),
    photographers: photographers.filter((item) => item.active !== false).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function deduplicateClients(clients: Client[], reservations: Reservation[]) {
  const referencedUuids = new Set(
    reservations.map((reservation) => reservation.partner_uuid).filter(Boolean),
  );
  const sortedClients = [...clients].sort((left, right) => {
    const leftReferenced = referencedUuids.has(left.sync_uuid) ? 1 : 0;
    const rightReferenced = referencedUuids.has(right.sync_uuid) ? 1 : 0;
    if (leftReferenced !== rightReferenced) {
      return rightReferenced - leftReferenced;
    }
    return String(right.updated_at || '').localeCompare(String(left.updated_at || ''));
  });
  const result: Client[] = [];
  const knownNames = new Set<string>();
  const knownPhones = new Set<string>();

  for (const client of sortedClients) {
    const name = normalize(client.name);
    const phone = normalizePhone(client.phone);
    if (
      (name && knownNames.has(name)) ||
      (phone && knownPhones.has(phone))
    ) {
      continue;
    }
    result.push(client);
    if (name) {
      knownNames.add(name);
    }
    if (phone) {
      knownPhones.add(phone);
    }
  }
  return result;
}

function mergeClientsWithReservations(clients: Client[], reservations: Reservation[]) {
  const merged = [...clients];
  const knownUuids = new Set(
    clients.map((client) => client.sync_uuid).filter(Boolean),
  );
  const knownNames = new Set(
    clients.map((client) => normalize(client.name)).filter(Boolean),
  );
  const knownPhones = new Set(
    clients.map((client) => normalizePhone(client.phone)).filter(Boolean),
  );

  for (const reservation of reservations) {
    const name = (reservation.customer_name || '').trim();
    const phone = normalizePhone(reservation.phone);
    const partnerUuid = reservation.partner_uuid || '';
    if (
      !name ||
      (partnerUuid && knownUuids.has(partnerUuid)) ||
      knownNames.has(normalize(name)) ||
      (phone && knownPhones.has(phone))
    ) {
      continue;
    }

    const client: Client = {
      sync_uuid: partnerUuid || `reservation-${reservation.sync_uuid}`,
      name,
      phone: reservation.phone || null,
      birthdate: reservation.birthdate || null,
      active: true,
      updated_at: reservation.updated_at || null,
    };
    merged.push(client);
    knownUuids.add(client.sync_uuid);
    knownNames.add(normalize(name));
    if (phone) {
      knownPhones.add(phone);
    }
  }
  return merged;
}

async function syncTable<T extends { sync_uuid: string; updated_at?: string | null; active?: boolean | null }>(
  tableName: string,
  query: Record<string, string>,
) {
  const cachedRows = await getCachedRows<T>(tableName);
  const lastUpdate = await getLastCachedUpdate(tableName);
  try {
    const remoteRows = await readTable<T>(tableName, {
      ...query,
      ...(lastUpdate ? { updated_at: `gt.${lastUpdate}` } : {}),
    });
    await upsertCachedRows(tableName, remoteRows);
    if (!remoteRows.length) {
      return cachedRows;
    }
    return getCachedRows<T>(tableName);
  } catch (error) {
    if (cachedRows.length) {
      return cachedRows;
    }
    throw error;
  }
}

export async function saveReservation(form: ReservationForm, clients: Client[]) {
  const now = new Date().toISOString();
  const duration = normalizeDurationHours(form.duration_hours);
  const startLocal = `${form.date.trim()} ${form.time.trim()}:00`;
  const start = parseLocalDateTime(form.date.trim(), form.time.trim());
  const stop = new Date(start.getTime() + duration * 60 * 60 * 1000);
  const stopLocal = toLocalDatabaseString(stop);
  const existingClient = clients.find(
    (client) =>
      client.sync_uuid === form.partner_uuid ||
      normalize(client.name) === normalize(form.customer_name) ||
      (form.phone && client.phone === form.phone),
  );

  let partnerUuid =
    existingClient && !isInferredClient(existingClient)
      ? existingClient.sync_uuid
      : undefined;
  let savedClientRows: Client[] = [];
  if (!partnerUuid) {
    partnerUuid = makeUuid();
    savedClientRows = await insertRow<Client>('lafoteria_clients', {
      sync_uuid: partnerUuid,
      name: form.customer_name.trim(),
      phone: form.phone.trim() || null,
      birthdate: form.birthdate || null,
      active: true,
      updated_at: now,
    });
  } else if (existingClient && !isInferredClient(existingClient)) {
    savedClientRows = await updateRow<Client>('lafoteria_clients', partnerUuid, {
      name: form.customer_name.trim(),
      phone: form.phone.trim() || null,
      birthdate: form.birthdate || null,
      active: true,
      updated_at: now,
    });
  }

  const row = {
    sync_uuid: form.sync_uuid || makeUuid(),
    partner_uuid: partnerUuid,
    customer_name: form.customer_name.trim(),
    phone: form.phone.trim() || null,
    birthdate: form.birthdate || null,
    session_type_uuid: form.session_type_uuid || null,
    session_type: form.session_type || null,
    duration_hours: duration,
    date_start: startLocal.replace(' ', 'T'),
    date_stop: stopLocal.replace(' ', 'T'),
    date_start_local: startLocal,
    date_stop_local: stopLocal,
    schedule_local: `${form.time.trim()} - ${timeLabel(stop)}`,
    timezone: 'America/Havana',
    photographer_uuid: form.photographer_uuid || null,
    photographer_name: form.photographer_name || null,
    advance_amount: Number(form.advance_amount) || 0,
    advance_payment_method: form.advance_payment_method || null,
    state: 'reserved',
    note: form.note || null,
    sync_status: 'pending',
    updated_at: now,
  };

  let savedReservationRows: Reservation[] = [];
  if (form.sync_uuid) {
    savedReservationRows = await updateRow<Reservation>('lafoteria_reservations', form.sync_uuid, row);
  } else {
    savedReservationRows = await insertRow<Reservation>('lafoteria_reservations', row);
  }
  await Promise.all([
    upsertCachedRows('lafoteria_clients', savedClientRows),
    upsertCachedRows('lafoteria_reservations', savedReservationRows),
  ]);
  return savedReservationRows;
}

export function formFromReservation(reservation: Reservation): ReservationForm {
  const dateStart = reservation.date_start_local || reservation.date_start || '';
  const [date = '', rawTime = ''] = dateStart.replace('T', ' ').split(' ');
  return {
    sync_uuid: reservation.sync_uuid,
    partner_uuid: reservation.partner_uuid || '',
    customer_name: reservation.customer_name || '',
    phone: reservation.phone || '',
    birthdate: reservation.birthdate || '',
    session_type_uuid: reservation.session_type_uuid || '',
    session_type: reservation.session_type || '',
    duration_hours: String(normalizeDurationHours(reservation.duration_hours || 1)),
    date,
    time: rawTime.slice(0, 5),
    photographer_uuid: reservation.photographer_uuid || '',
    photographer_name: reservation.photographer_name || '',
    advance_amount: String(reservation.advance_amount || ''),
    advance_payment_method: normalizePaymentMethod(reservation.advance_payment_method || ''),
    note: reservation.note || '',
  };
}

export function emptyForm(date = todayIsoDate()): ReservationForm {
  return {
    customer_name: '',
    phone: '',
    birthdate: '',
    session_type_uuid: '',
    session_type: '',
    duration_hours: '1',
    date,
    time: '09:00',
    photographer_uuid: '',
    photographer_name: '',
    advance_amount: '',
    advance_payment_method: '',
    note: '',
  };
}

export function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export function dateKey(reservation: Reservation) {
  const value = reservation.date_start_local || reservation.date_start || '';
  return value.slice(0, 10);
}

export function timeRange(reservation: Reservation) {
  if (reservation.schedule_local) {
    return reservation.schedule_local;
  }
  const start = (reservation.date_start_local || reservation.date_start || '').slice(11, 16);
  const stop = (reservation.date_stop_local || reservation.date_stop || '').slice(11, 16);
  return stop ? `${start} - ${stop}` : start;
}

export function weekDays(anchorDate: string) {
  const anchor = new Date(`${anchorDate}T12:00:00`);
  const mondayOffset = (anchor.getDay() + 6) % 7;
  const monday = new Date(anchor);
  monday.setDate(anchor.getDate() - mondayOffset);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + index);
    return day.toISOString().slice(0, 10);
  });
}

export function formatDayLabel(date: string) {
  return new Intl.DateTimeFormat('es-CU', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(new Date(`${date}T12:00:00`));
}

function toLocalDatabaseString(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${timeLabel(date)}:00`;
}

function timeLabel(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function normalizePhone(value: string | null | undefined) {
  return (value || '').replace(/\D/g, '');
}

function isInferredClient(client: Client) {
  return client.sync_uuid.startsWith('reservation-');
}

function dateTimeSortValue(reservation: Reservation) {
  return reservation.date_start_local || reservation.date_start || '';
}

function normalizePaymentMethod(value: string) {
  const normalized = normalize(value);
  if (normalized === 'efectivo') {
    return 'cash';
  }
  if (normalized === 'transferencia') {
    return 'transfer';
  }
  return value;
}

export function normalizeDurationHours(value: string | number | null | undefined) {
  const duration = Number(value) || 1;
  if (duration <= 0) {
    return 1;
  }
  if (duration >= 1) {
    return duration;
  }

  const textValue = String(value ?? duration);
  const decimalPart = textValue.includes('.') ? textValue.split('.')[1] : '';
  if (duration === 0.5 || decimalPart === '5') {
    return 0.5;
  }
  if (decimalPart) {
    const minutes = Number(decimalPart.padEnd(2, '0').slice(0, 2));
    if (minutes > 0 && minutes < 60) {
      return minutes / 60;
    }
  }
  return Math.max(duration, 0.5);
}

function parseLocalDateTime(date: string, time: string) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return new Date(year, (month || 1) - 1, day || 1, hour || 0, minute || 0, 0);
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}
