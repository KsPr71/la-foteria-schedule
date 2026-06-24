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

  if (!Device.isDevice) {
    throw new Error(
      'DISPOSITIVO: Las notificaciones push requieren un dispositivo fisico.',
    );
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

  try {
    await Notifications.getDevicePushTokenAsync();
  } catch (error) {
    throw new Error(
      `FCM: No se pudo obtener el token nativo de Firebase. ${errorMessage(error)}`,
    );
  }

  let expoPushToken: string;
  try {
    expoPushToken = (
      await Notifications.getExpoPushTokenAsync({ projectId })
    ).data;
  } catch (error) {
    throw new Error(
      `EXPO: Firebase respondio, pero no se pudo obtener el ExpoPushToken. ${errorMessage(error)}`,
    );
  }

  try {
    await callRpc('register_lafoteria_push_token', {
      p_expo_push_token: expoPushToken,
      p_platform: Platform.OS,
      p_device_name: Device.deviceName || Device.modelName || 'Dispositivo',
    });
  } catch (error) {
    throw new Error(
      `SUPABASE: Se obtuvo el token, pero no se pudo registrar. ${errorMessage(error)}`,
    );
  }

  return expoPushToken;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === 'object') {
    try {
      return JSON.stringify(error);
    } catch {
      return 'Error desconocido';
    }
  }
  return String(error);
}
