import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Pressable, StyleSheet, useColorScheme, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { requestNewReservation } from '@/lib/reservationActions';

const brick = '#8f332a';

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];

  const openNewReservation = () => {
    router.navigate('/');
    setTimeout(requestNewReservation, 80);
  };

  return (
    <View style={styles.root}>
      <NativeTabs
        backgroundColor={colors.background}
        indicatorColor={colors.backgroundElement}
        labelStyle={{ selected: { color: colors.text } }}>
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Label>Agenda</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            src={require('@/assets/images/tabIcons/home.png')}
            renderingMode="template"
          />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="explore">
          <NativeTabs.Trigger.Label>Datos</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            src={require('@/assets/images/tabIcons/explore.png')}
            renderingMode="template"
          />
        </NativeTabs.Trigger>
      </NativeTabs>
      <Pressable
  accessibilityLabel="Nueva reserva"
  style={({ pressed }) => [
    styles.centerAction,
    pressed && { backgroundColor: '#ff0000' } // Cambia a un tono más oscuro
  ]}
  onPress={openNewReservation}>
  <MaterialCommunityIcons name="plus" color="#fff" size={32} />
</Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  centerAction: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 62,
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: brick,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 10,
    zIndex: 50,
  },
});
