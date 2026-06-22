import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import {
  Client,
  Photographer,
  SessionType,
  loadScheduleData,
} from '@/lib/schedule';
import { AppPalette, useAppPalette } from '@/lib/appPalette';

const ink = '#172033';
const muted = '#657084';
const line = '#e7dfda';
const paper = '#fffaf6';

export default function DataScreen() {
  const { palette } = useAppPalette();
  const themed = makeThemedStyles(palette);
  const [clients, setClients] = useState<Client[]>([]);
  const [sessionTypes, setSessionTypes] = useState<SessionType[]>([]);
  const [photographers, setPhotographers] = useState<Photographer[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await loadScheduleData();
      setClients(data.clients);
      setSessionTypes(data.sessionTypes);
      setPhotographers(data.photographers);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return (
    <SafeAreaView style={[styles.screen, themed.screen]}>
      <View style={styles.header}>
        <Text style={[styles.eyebrow, themed.accentText]}>SQLite + Supabase</Text>
        <Text style={[styles.title, themed.title]}>Datos locales</Text>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={palette.accent} />}>
        {loading ? <ActivityIndicator color={palette.accent} /> : null}
        <Section title="Tipos de sesión" count={sessionTypes.length}>
          {sessionTypes.map((item) => (
            <Row key={item.sync_uuid} title={item.name} detail={`${item.duration_hours || 1} h`} />
          ))}
        </Section>
        <Section title="Fotógrafos" count={photographers.length}>
          {photographers.map((item) => (
            <Row key={item.sync_uuid} title={item.name} />
          ))}
        </Section>
        <Section title="Clientes" count={clients.length}>
          {clients.slice(0, 40).map((item) => (
            <Row key={item.sync_uuid} title={item.name} detail={item.phone || 'Sin teléfono'} />
          ))}
          {clients.length > 40 ? <Text style={styles.more}>Se muestran los primeros 40 clientes.</Text> : null}
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  const { palette } = useAppPalette();
  const themed = makeThemedStyles(palette);
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={[styles.section, themed.section]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        style={({ pressed }) => [
          styles.sectionHeader,
          themed.sectionHeader,
          pressed && styles.sectionHeaderPressed,
        ]}
        onPress={() => setExpanded((current) => !current)}>
        <View style={styles.sectionHeaderTitle}>
          <MaterialCommunityIcons
            name={expanded ? 'chevron-down' : 'chevron-right'}
            color={palette.accent}
            size={24}
          />
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        <Text style={[styles.badge, themed.badge]}>{count}</Text>
      </Pressable>
      {expanded ? children : null}
    </View>
  );
}

function Row({ title, detail }: { title: string; detail?: string }) {
  const { palette } = useAppPalette();
  const themed = makeThemedStyles(palette);
  return (
    <View style={[styles.row, themed.row]}>
      <Text style={styles.rowTitle}>{title}</Text>
      {!!detail && <Text style={styles.rowDetail}>{detail}</Text>}
    </View>
  );
}

function makeThemedStyles(palette: AppPalette) {
  return StyleSheet.create({
    screen: {
      backgroundColor: palette.paper,
    },
    title: {
      color: palette.ink,
    },
    accentText: {
      color: palette.accent,
    },
    section: {
      borderColor: palette.line,
      backgroundColor: '#fff',
    },
    sectionHeader: {
      backgroundColor: palette.accentSoft,
    },
    badge: {
      color: palette.accent,
      backgroundColor: '#fff',
      borderColor: palette.line,
    },
    row: {
      borderTopColor: palette.line,
    },
  });
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: paper,
  },
  header: {
    padding: 20,
  },
  eyebrow: {
    color: ink,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  title: {
    color: ink,
    fontSize: 28,
    fontWeight: '900',
  },
  content: {
    padding: 20,
    paddingTop: 0,
    gap: 16,
  },
  section: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: line,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  sectionHeader: {
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionHeaderPressed: {
    opacity: 0.82,
  },
  sectionHeaderTitle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    color: ink,
    fontSize: 16,
    fontWeight: '900',
  },
  badge: {
    color: ink,
    fontWeight: '900',
    minWidth: 34,
    borderRadius: 17,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 4,
    textAlign: 'center',
    overflow: 'hidden',
  },
  row: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: line,
  },
  rowTitle: {
    color: ink,
    fontWeight: '800',
  },
  rowDetail: {
    color: muted,
    marginTop: 2,
  },
  more: {
    color: muted,
    padding: 14,
  },
});
