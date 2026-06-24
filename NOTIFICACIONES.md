# Notificaciones de reservas

El sistema usa:

- Firebase Cloud Messaging para entregar notificaciones en Android.
- Expo Push Service para enviar a FCM sin exponer credenciales en la app.
- Supabase Edge Functions para construir y enviar los mensajes.
- PostgreSQL Trigger para avisar al crear una reserva.
- Supabase Cron para revisar diariamente las reservas del dia siguiente.

## Eventos

### Nueva reserva

Al insertar un registro en `lafoteria_reservations`, Supabase envia:

```text
Nueva reserva
Cliente · horario · tipo de sesion
```

### Reservas de manana

Cada hora Supabase ejecuta la funcion. La funcion solo envia a las 18:00 en
`America/Havana`, evitando problemas por cambios de horario de verano.

Si existen reservas:

```text
3 reservas para mañana
09:00 - 10:00 Cliente A · 11:00 - 12:00 Cliente B
```

Si no existen:

```text
Agenda de mañana
No hay reservas para mañana
```

## 1. Configurar Firebase

1. Crear o abrir el proyecto en Firebase Console.
2. Agregar una aplicacion Android con el package:

   ```text
   com.lafoteria.schedule
   ```

3. Descargar `google-services.json` y colocarlo en la raiz de la app.
4. Agregar dentro de `expo.android` en `app.json`:

   ```json
   "googleServicesFile": "./google-services.json"
   ```

5. En Firebase, crear una cuenta de servicio para FCM HTTP v1.
6. Subir el JSON de esa cuenta a EAS:

   ```powershell
   npx eas credentials -p android
   ```

   Seleccionar `Push Notifications (FCM V1)` y subir la clave.

`google-services.json` identifica la aplicacion Firebase. La cuenta de servicio
FCM v1 autoriza a EAS/Expo para entregar las notificaciones.

## 2. Desplegar Supabase

Instalar o ejecutar Supabase CLI y vincular el proyecto:

```powershell
npx supabase login
npx supabase link --project-ref vzpulvvkhralddzwthap
npx supabase db push
npx supabase functions deploy lafoteria-notifications --no-verify-jwt
```

La funcion rechaza internamente cualquier llamada que no use la
`service_role`, aunque se despliegue con `--no-verify-jwt`.

## 3. Guardar secretos en Vault

Desde SQL Editor de Supabase:

```sql
select vault.create_secret(
    'https://vzpulvvkhralddzwthap.supabase.co',
    'project_url'
);

select vault.create_secret(
    'PEGAR_AQUI_LA_SERVICE_ROLE_KEY',
    'service_role_key'
);
```

La `service_role_key` se obtiene en:

```text
Supabase Dashboard > Project Settings > API
```

Nunca debe colocarse en `.env` de la aplicacion ni en código cliente.

## 4. Generar un build nuevo

`expo-notifications` y Firebase necesitan un build nativo nuevo:

```powershell
npx eas build -p android --profile preview --clear-cache
```

Al abrir la aplicacion instalada:

1. Android solicitara permiso para notificaciones.
2. La app obtendra el `ExpoPushToken`.
3. El token se registrara mediante `register_lafoteria_push_token`.

Los dispositivos se almacenan en `lafoteria_push_tokens`.

## 5. Probar el resumen de manana

Crear primero un secreto exclusivo para las pruebas administrativas:

```powershell
npx supabase secrets set LAFOTERIA_NOTIFICATION_SECRET=UNA_CLAVE_LARGA_Y_ALEATORIA
```

Volver a desplegar la funcion:

```powershell
npx supabase functions deploy lafoteria-notifications --no-verify-jwt
```

En el probador de Edge Functions del Dashboard usar:

```text
Method: POST
Header: x-lafoteria-secret = UNA_CLAVE_LARGA_Y_ALEATORIA
```

Body:

```json
{
  "event": "tomorrow_summary",
  "force": true
}
```

La prueba manual ignora la hora y el registro de envio previo. Tambien puede
realizarse por terminal:

```powershell
curl.exe -X POST `
  "https://vzpulvvkhralddzwthap.supabase.co/functions/v1/lafoteria-notifications" `
  -H "x-lafoteria-secret: UNA_CLAVE_LARGA_Y_ALEATORIA" `
  -H "Content-Type: application/json" `
  -d '{"event":"tomorrow_summary","force":true}'
```

## Archivos

- `src/lib/pushNotifications.ts`: permisos y registro del dispositivo.
- `src/components/notification-bootstrap.tsx`: inicializacion en la app.
- `supabase/migrations/202606230001_lafoteria_push_notifications.sql`:
  tablas, RPC, trigger y cron.
- `supabase/functions/lafoteria-notifications/index.ts`: envio de mensajes.
