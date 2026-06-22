export const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://vzpulvvkhralddzwthap.supabase.co';

export const SUPABASE_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_KEY ?? 'sb_publishable_WIliEe6d_j_cU5vfJJkgfg_vutDBD2l';

const REST_URL = SUPABASE_URL.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '') + '/rest/v1';

type QueryValue = string | number | boolean | null | undefined;

function headers(prefer?: string) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

function buildUrl(table: string, query?: Record<string, QueryValue>) {
  const params = new URLSearchParams();
  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.append(key, String(value));
    }
  });
  const suffix = params.toString();
  return `${REST_URL}/${table}${suffix ? `?${suffix}` : ''}`;
}

async function request<T>(
  table: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    query?: Record<string, QueryValue>;
    body?: unknown;
    prefer?: string;
  } = {},
) {
  const response = await fetch(buildUrl(table, options.query), {
    method: options.method ?? 'GET',
    headers: headers(options.prefer),
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase ${response.status}: ${text || response.statusText}`);
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : []) as T;
}

export function readTable<T>(table: string, query?: Record<string, QueryValue>) {
  return request<T[]>(table, { query });
}

export function insertRow<T>(table: string, row: Record<string, unknown>) {
  return request<T[]>(table, {
    method: 'POST',
    body: row,
    prefer: 'return=representation',
  });
}

export function updateRow<T>(table: string, syncUuid: string, row: Record<string, unknown>) {
  return request<T[]>(table, {
    method: 'PATCH',
    query: { sync_uuid: `eq.${syncUuid}` },
    body: row,
    prefer: 'return=representation',
  });
}

export function makeUuid() {
  const random = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1);
  return `${random()}${random()}-${random()}-${random()}-${random()}-${random()}${random()}${random()}`;
}
