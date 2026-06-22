import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';

import {
  Client,
  Photographer,
  SessionType,
  loadScheduleData,
} from '@/lib/schedule';

const brick = '#8f332a';
const ink = '#172033';
const muted = '#657084';
const line = '#e7dfda';
const paper = '#fffaf6';

export default function DataScreen() {
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
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>SQLite + Supabase</Text>
        <Text style={styles.title}>Datos locales</Text>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={brick} />}>
        {loading ? <ActivityIndicator color={brick} /> : null}
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
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.badge}>{count}</Text>
      </View>
      {children}
    </View>
  );
}

function Row({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowTitle}>{title}</Text>
      {!!detail && <Text style={styles.rowDetail}>{detail}</Text>}
    </View>
  );
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
    color: brick,
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
    backgroundColor: '#f7ece9',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    color: ink,
    fontSize: 16,
    fontWeight: '900',
  },
  badge: {
    color: brick,
    fontWeight: '900',
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
