import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { router, Tabs } from "expo-router";
import type { ReactNode } from "react";
import type { AccessibilityState, GestureResponderEvent } from "react-native";
import { Image, Pressable, StyleSheet, View } from "react-native";

import { useAppPalette } from "@/lib/appPalette";
import { requestNewReservation } from "@/lib/reservationActions";

const TAB_BAR_HEIGHT = 58;
const CENTER_BUTTON_SIZE = 50;

export default function AppTabs() {
  const { palette } = useAppPalette();

  const openNewReservation = () => {
    router.navigate("/");
    setTimeout(requestNewReservation, 80);
  };

  return (
    <View style={styles.root}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: false,
          tabBarActiveTintColor: palette.accent,
          tabBarInactiveTintColor: palette.muted,
          tabBarStyle: [
            styles.tabBar,
            {
              height: TAB_BAR_HEIGHT,
              backgroundColor: palette.paper,
              borderColor: palette.line,
            },
          ],
          tabBarItemStyle: styles.tabBarItem,
          tabBarButton: (props) => (
            <TabPillButton
              accessibilityLabel={props.accessibilityLabel}
              accessibilityState={props.accessibilityState}
              onLongPress={props.onLongPress}
              onPress={props.onPress}
              testID={props.testID}
              activeColor={palette.accentSoft}
              accentColor={palette.accent}
            >
              {props.children}
            </TabPillButton>
          ),
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Agenda",
            tabBarAccessibilityLabel: "Agenda",
            tabBarIcon: ({ color }) => (
              <Image
                source={require("@/assets/images/tabIcons/home.png")}
                style={[styles.tabIcon, { tintColor: color }]}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="explore"
          options={{
            title: "Datos",
            tabBarAccessibilityLabel: "Datos",
            tabBarIcon: ({ color }) => (
              <Image
                source={require("@/assets/images/tabIcons/explore.png")}
                style={[styles.tabIcon, { tintColor: color }]}
              />
            ),
          }}
        />
      </Tabs>

      <Pressable
        accessibilityLabel="Nueva reserva"
        style={({ pressed }) => [
          styles.centerAction,
          { backgroundColor: palette.accent },
          pressed && styles.centerActionPressed,
        ]}
        onPress={openNewReservation}
      >
        <MaterialCommunityIcons name="plus" color="#fff" size={27} />
      </Pressable>
    </View>
  );
}

function TabPillButton({
  accessibilityLabel,
  accessibilityState,
  accentColor,
  activeColor,
  children,
  onLongPress,
  onPress,
  testID,
}: {
  accessibilityLabel?: string;
  accessibilityState?: AccessibilityState;
  accentColor: string;
  activeColor: string;
  children?: ReactNode;
  onLongPress?: ((event: GestureResponderEvent) => void) | null;
  onPress?: ((event: GestureResponderEvent) => void) | null;
  testID?: string;
}) {
  const selected = accessibilityState?.selected === true;
  return (
    <View style={styles.tabButtonSlot}>
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={accessibilityState}
        android_ripple={{ color: activeColor, borderless: false }}
        onLongPress={onLongPress}
        onPress={onPress}
        testID={testID}
        style={({ pressed }) => [
          styles.tabPill,
          selected && {
            backgroundColor: activeColor,
            borderColor: accentColor,
          },
          pressed && styles.tabPillPressed,
        ]}
      >
        {children}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  tabBar: {
    position: "absolute",
    left: 14,
    right: 14,
    //bottom: 10,
    paddingTop: 4,
    // paddingBottom: 4,
    //borderWidth: StyleSheet.hairlineWidth,
    //borderRadius: 22,
    overflow: "hidden",
    // elevation: 10,
  },
  tabBarItem: {
    height: 50,
  },
  tabButtonSlot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tabPill: {
    width: 60,
    height: 38,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  tabPillPressed: {
    opacity: 0.72,
  },
  tabIcon: {
    width: 23,
    height: 23,
    resizeMode: "contain",
  },
  centerAction: {
    position: "absolute",
    alignSelf: "center",
    bottom: 10,
    width: CENTER_BUTTON_SIZE,
    height: CENTER_BUTTON_SIZE,
    borderRadius: CENTER_BUTTON_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 9,
    zIndex: 50,
  },
  centerActionPressed: {
    opacity: 0.82,
  },
});
