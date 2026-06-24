export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
export const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY;

type QueryValue = string | number | boolean | null | undefined;

function getSupabaseConfig() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Faltan EXPO_PUBLIC_SUPABASE_URL o EXPO_PUBLIC_SUPABASE_KEY. Reinicia Expo con el archivo .env en la raiz del proyecto.');
  }
  return {
    key: SUPABASE_KEY,
    restUrl: SUPABASE_URL.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '') + '/rest/v1',
  };
}

function headers(key: string, prefer?: string) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

function buildUrl(restUrl: string, table: string, query?: Record<string, QueryValue>) {
  const params = new URLSearchParams();
  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.append(key, String(value));
    }
  });
  const suffix = params.toString();
  return `${restUrl}/${table}${suffix ? `?${suffix}` : ''}`;
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
  const config = getSupabaseConfig();
  const response = await fetch(buildUrl(config.restUrl, table, options.query), {
    method: options.method ?? 'GET',
    headers: headers(config.key, options.prefer),
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

export function callRpc<T>(functionName: string, body: Record<string, unknown>) {
  return request<T>(`rpc/${functionName}`, {
    method: 'POST',
    body,
  });
}

export function makeUuid() {
  const random = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1);
  return `${random()}${random()}-${random()}-${random()}-${random()}-${random()}${random()}${random()}`;
}
