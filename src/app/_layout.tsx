import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { NavigationBar } from 'expo-navigation-bar';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { NotificationBootstrap } from '@/components/notification-bootstrap';
import { AppPaletteProvider } from '@/lib/appPalette';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AppPaletteProvider>
        <NavigationBar hidden style="dark" />
        <NotificationBootstrap />
        <AnimatedSplashOverlay />
        <AppTabs />
      </AppPaletteProvider>
    </ThemeProvider>
  );
}
