import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useEffect } from 'react';

export function NotificationBootstrap() {
  useEffect(() => {
    if (Constants.appOwnership === 'expo') {
      console.info(
        'Las notificaciones remotas se activaran en un development build o APK, no en Expo Go.',
      );
      return;
    }

    let active = true;
    let removeResponseListener: (() => void) | undefined;

    Promise.all([
      import('expo-notifications'),
      import('@/lib/pushNotifications'),
    ])
      .then(([Notifications, pushNotifications]) => {
        if (!active) {
          return;
        }

        pushNotifications.registerPushNotifications().catch((error) => {
          console.warn('No se pudieron activar las notificaciones', error);
        });

        const subscription =
          Notifications.addNotificationResponseReceivedListener(() => {
            router.navigate('/');
          });
        removeResponseListener = () => subscription.remove();
      })
      .catch((error) => {
        console.warn('No se pudo cargar el sistema de notificaciones', error);
      });

    return () => {
      active = false;
      removeResponseListener?.();
    };
  }, []);

  return null;
}
