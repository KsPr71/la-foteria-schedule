import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { callRpc } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerPushNotifications() {
  if (Platform.OS === 'web') {
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('reservas', {
      name: 'Reservas',
      description: 'Nuevas reservas y agenda del dia siguiente',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 150, 250],
      lightColor: '#8f332a',
      sound: 'default',
    });
  }

  const currentPermission = await Notifications.getPermissionsAsync();
  let status = currentPermission.status;
  if (status !== 'granted') {
    const requestedPermission = await Notifications.requestPermissionsAsync();
    status = requestedPermission.status;
  }
  if (status !== 'granted') {
    return null;
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId) {
    throw new Error('No se encontro el projectId de EAS para registrar notificaciones.');
  }

  const expoPushToken = (
    await Notifications.getExpoPushTokenAsync({ projectId })
  ).data;

  await callRpc('register_lafoteria_push_token', {
    p_expo_push_token: expoPushToken,
    p_platform: Platform.OS,
    p_device_name: Device.deviceName || Device.modelName || 'Dispositivo',
  });

  return expoPushToken;
}
