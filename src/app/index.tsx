import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Sharing from 'expo-sharing';
import PaperProvider from 'react-native-paper/lib/commonjs/core/PaperProvider';
import { Calendar, TimePickerModal, es, registerTranslation } from 'react-native-paper-dates';
import { captureRef } from 'react-native-view-shot';

import {
  Client,
  Photographer,
  Reservation,
  ReservationForm,
  SessionType,
  dateKey,
  deleteReservation,
  emptyForm,
  formFromReservation,
  formatDayLabel,
  loadScheduleData,
  normalizeDurationHours,
  saveReservation,
  timeRange,
  todayIsoDate,
  weekDays,
} from '@/lib/schedule';
import { AppPalette, appPalettes, useAppPalette } from '@/lib/appPalette';
import { subscribeNewReservation } from '@/lib/reservationActions';

const brick = '#8f332a';
const ink = '#172033';
const muted = '#657084';
const line = '#e7dfda';
const paper = '#fffaf6';
const soft = '#f7ece9';
const green = '#2f7a53';

registerTranslation('es', es);

const timeOptions = [
  '08:00',
  '08:30',
  '09:00',
  '09:30',
  '10:00',
  '10:30',
  '11:00',
  '11:30',
  '12:00',
  '13:00',
  '13:30',
  '14:00',
  '14:30',
  '15:00',
  '15:30',
  '16:00',
  '16:30',
  '17:00',
];

const durationOptions = [
  { label: '30 minutos', value: '0.5' },
  { label: '1 h', value: '1' },
  { label: '1 h 30 min', value: '1.5' },
  { label: '2 h', value: '2' },
  { label: '3 h', value: '3' },
];

type NotificationTokenStatus =
  | { state: 'idle'; message: string }
  | { state: 'checking'; message: string }
  | { state: 'success'; message: string; token: string }
  | { state: 'warning'; message: string }
  | { state: 'error'; message: string };

export default function AgendaScreen() {
  const { palette, setPaletteId } = useAppPalette();
  const receiptRef = useRef<View>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [sessionTypes, setSessionTypes] = useState<SessionType[]>([]);
  const [photographers, setPhotographers] = useState<Photographer[]>([]);
  const [selectedDate, setSelectedDate] = useState(todayIsoDate());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [formCalendarVisible, setFormCalendarVisible] = useState(false);
  const [clientSelectorVisible, setClientSelectorVisible] = useState(false);
  const [sessionSelectorVisible, setSessionSelectorVisible] = useState(false);
  const [photographerSelectorVisible, setPhotographerSelectorVisible] = useState(false);
  const [timeSelectorVisible, setTimeSelectorVisible] = useState(false);
  const [durationSelectorVisible, setDurationSelectorVisible] = useState(false);
  const [birthdateSelectorVisible, setBirthdateSelectorVisible] = useState(false);
  const [paletteSelectorVisible, setPaletteSelectorVisible] = useState(false);
  const [notificationTokenStatus, setNotificationTokenStatus] =
    useState<NotificationTokenStatus>({
      state: 'idle',
      message: 'Token sin comprobar',
    });
  const [newClientMode, setNewClientMode] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [sessionSearch, setSessionSearch] = useState('');
  const [photographerSearch, setPhotographerSearch] = useState('');
  const [form, setForm] = useState<ReservationForm>(emptyForm());
  const [deletingReservationId, setDeletingReservationId] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await loadScheduleData();
      setReservations(data.reservations);
      setClients(data.clients);
      setSessionTypes(data.sessionTypes);
      setPhotographers(data.photographers);
    } catch (error) {
      Alert.alert('No se pudo cargar la agenda', String(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const selectedReservations = useMemo(
    () =>
      reservations
        .filter((reservation) => dateKey(reservation) === selectedDate)
        .sort((a, b) => timeRange(a).localeCompare(timeRange(b))),
    [reservations, selectedDate],
  );

  const week = useMemo(() => weekDays(selectedDate), [selectedDate]);
  const weekTitle = useMemo(() => `${shortDate(week[0])} - ${shortDate(week[6])}`, [week]);
  const themed = useMemo(() => makeThemedStyles(palette), [palette]);

  const selectedClient = clients.find((client) => client.sync_uuid === form.partner_uuid);
  const selectedSessionType = sessionTypes.find((item) => item.sync_uuid === form.session_type_uuid);
  const selectedPhotographer = photographers.find((item) => item.sync_uuid === form.photographer_uuid);

  const filteredClients = useMemo(
    () => filterByText(clients, clientSearch, (item) => `${item.name} ${item.phone ?? ''}`),
    [clients, clientSearch],
  );
  const filteredSessionTypes = useMemo(
    () => filterByText(sessionTypes, sessionSearch, (item) => item.name),
    [sessionTypes, sessionSearch],
  );
  const filteredPhotographers = useMemo(
    () => filterByText(photographers, photographerSearch, (item) => item.name),
    [photographers, photographerSearch],
  );

  const changeSelectedDay = useCallback((amount: number) => {
    setSelectedDate((current) => shiftIsoDate(current, amount));
  }, []);

  const agendaPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dx) > 35 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.4,
      onPanResponderRelease: (_, gestureState) => {
        if (Math.abs(gestureState.dx) < 70 || Math.abs(gestureState.dx) < Math.abs(gestureState.dy) * 1.4) {
          return;
        }
        if (gestureState.dx < 0) {
          changeSelectedDay(1);
        } else {
          changeSelectedDay(-1);
        }
      },
    }),
  ).current;

  const openNew = useCallback(() => {
    const nextForm = emptyForm(selectedDate);
    setForm(nextForm);
    setNewClientMode(false);
    setFormVisible(true);
  }, [selectedDate]);

  useEffect(() => subscribeNewReservation(openNew), [openNew]);

  const openEdit = (reservation: Reservation) => {
    const nextForm = formFromReservation(reservation);
    setForm(nextForm);
    setNewClientMode(!nextForm.partner_uuid);
    setFormVisible(true);
  };

  const updateForm = (key: keyof ReservationForm, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const selectClient = (client: Client) => {
    setForm((current) => ({
      ...current,
      partner_uuid: client.sync_uuid,
      customer_name: client.name,
      phone: client.phone || '',
      birthdate: client.birthdate || '',
    }));
    setNewClientMode(false);
    setClientSelectorVisible(false);
  };

  const startNewClient = () => {
    setForm((current) => ({
      ...current,
      partner_uuid: '',
      customer_name: '',
      phone: '',
      birthdate: '',
    }));
    setNewClientMode(true);
    setClientSelectorVisible(false);
  };

  const selectSessionType = (sessionType: SessionType) => {
    const duration = normalizeDurationHours(sessionType.duration_hours || currentDurationFallback(form.duration_hours));
    setForm((current) => ({
      ...current,
      session_type_uuid: sessionType.sync_uuid,
      session_type: sessionType.name,
      duration_hours: String(duration),
    }));
    setSessionSelectorVisible(false);
  };

  const selectPhotographer = (photographer: Photographer) => {
    setForm((current) => ({
      ...current,
      photographer_uuid: photographer.sync_uuid,
      photographer_name: photographer.name,
    }));
    setPhotographerSelectorVisible(false);
  };

  const submit = async () => {
    if (!form.customer_name.trim()) {
      Alert.alert('Falta el cliente', 'Selecciona un cliente o crea uno nuevo.');
      return;
    }
    if (!form.date || !form.time) {
      Alert.alert('Falta el horario', 'Indica fecha y hora de la reserva.');
      return;
    }
    setSaving(true);
    try {
      await saveReservation(form, clients);
      setFormVisible(false);
      await refresh();
    } catch (error) {
      Alert.alert('No se pudo guardar', String(error));
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteReservation = (reservation: Reservation) => {
    Alert.alert(
      'Eliminar reserva',
      `¿Deseas eliminar la reserva de ${reservation.customer_name}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            setDeletingReservationId(reservation.sync_uuid);
            try {
              await deleteReservation(reservation.sync_uuid);
              setReservations((current) =>
                current.filter((item) => item.sync_uuid !== reservation.sync_uuid),
              );
            } catch (error) {
              Alert.alert('No se pudo eliminar', String(error));
            } finally {
              setDeletingReservationId('');
            }
          },
        },
      ],
    );
  };

  const shareReservationReceipt = async () => {
    if (!form.customer_name.trim()) {
      Alert.alert('Falta el cliente', 'Selecciona o introduce el nombre del cliente antes de generar el recibo.');
      return;
    }
    if (!form.date || !form.time) {
      Alert.alert('Falta el horario', 'Indica fecha y hora de la reserva antes de generar el recibo.');
      return;
    }
    if (!(await Sharing.isAvailableAsync())) {
      Alert.alert('Compartir no disponible', 'Este dispositivo no tiene disponible el menú de compartir.');
      return;
    }
    try {
      await new Promise((resolve) => setTimeout(resolve, 80));
      const uri = await captureRef(receiptRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'Enviar recibo de reserva',
      });
    } catch (error) {
      Alert.alert('No se pudo generar la imagen', String(error));
    }
  };

  const checkNotificationToken = async () => {
    if (Constants.appOwnership === 'expo') {
      setNotificationTokenStatus({
        state: 'warning',
        message: 'No disponible en Expo Go. Usa un APK o development build.',
      });
      return;
    }

    setNotificationTokenStatus({
      state: 'checking',
      message: 'Comprobando token...',
    });
    try {
      const { registerPushNotifications } = await import(
        '@/lib/pushNotifications'
      );
      const token = await registerPushNotifications();
      if (!token) {
        setNotificationTokenStatus({
          state: 'warning',
          message: 'El permiso de notificaciones no está concedido.',
        });
        return;
      }
      setNotificationTokenStatus({
        state: 'success',
        message: 'Token registrado correctamente en Supabase.',
        token,
      });
    } catch (error) {
      setNotificationTokenStatus({
        state: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <PaperProvider
      settings={{
        icon: ({ name, color, size }) => (
          <MaterialCommunityIcons name={name} color={color} size={size} />
        ),
      }}>
    <SafeAreaView style={[styles.screen, themed.screen]}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.eyebrow, themed.accentText]}>La Fotería</Text>
          <Text style={[styles.title, themed.title]}>Agenda de Reservas</Text>
        </View>
        <Pressable
          accessibilityLabel="Cambiar paleta de colores"
          style={[styles.paletteButton, themed.paletteButton]}
          onPress={() => setPaletteSelectorVisible(true)}>
          <MaterialCommunityIcons name="cog-outline" color={palette.accent} size={24} />
        </Pressable>
      </View>

      <View style={styles.calendarSelectorRow}>
        <Pressable style={[styles.calendarSelector, themed.outlinedSurface]} onPress={() => setCalendarVisible(true)}>
          <Text style={styles.calendarSelectorLabel}>Semana</Text>
          <Text style={styles.calendarSelectorValue}>{weekTitle}</Text>
        </Pressable>
        <Pressable
          style={[styles.todayButton, themed.softButton]}
          onPress={() => {
            const today = todayIsoDate();
            setSelectedDate(today);
          }}>
          <Text style={[styles.todayButtonText, themed.accentText]}>Hoy</Text>
        </Pressable>
      </View>

      <View style={styles.weekStrip}>
        {week.map((day) => {
          const count = reservations.filter((reservation) => dateKey(reservation) === day).length;
          const selected = day === selectedDate;
          const empty = count === 0;
          return (
            <Pressable
              key={day}
              onPress={() => setSelectedDate(day)}
              style={[
                styles.dayButton,
                themed.dayButton,
                empty && !selected && styles.dayButtonEmpty,
                selected && themed.dayButtonSelected,
              ]}>
              <Text style={[styles.dayLabel, selected && styles.dayLabelSelected]}>
                {formatDayLabel(day)}
              </Text>
              <Text style={[styles.dayCount, empty && !selected && styles.dayCountEmpty, selected && styles.dayLabelSelected]}>
                {count}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        {...agendaPanResponder.panHandlers}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={palette.accent} />}>
        {loading && !selectedReservations.length ? (
          <View style={styles.emptyState}>
            <ActivityIndicator color={palette.accent} />
            <Text style={styles.emptyText}>Cargando reservas...</Text>
          </View>
        ) : selectedReservations.length ? (
          selectedReservations.map((reservation) => (
            <ReservationCard
              key={reservation.sync_uuid}
              reservation={reservation}
              onPress={() => openEdit(reservation)}
              onDelete={() => confirmDeleteReservation(reservation)}
              deleting={deletingReservationId === reservation.sync_uuid}
            />
          ))
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Sin sesiones</Text>
            <Text style={styles.emptyText}>No hay reservas para este día.</Text>
            <Pressable style={styles.secondaryButton} onPress={openNew}>
              <Text style={styles.secondaryButtonText}>Crear reserva</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      <Modal visible={formVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={[styles.modalScreen, themed.screen]}>
          <View style={[styles.modalHeader, themed.modalHeader]}>
            <View>
              <Text style={[styles.eyebrow, themed.accentText]}>{form.sync_uuid ? 'Editar' : 'Nueva'}</Text>
              <Text style={[styles.modalTitle, themed.title]}>Reserva</Text>
            </View>
            <Pressable onPress={() => setFormVisible(false)} style={[styles.closeButton, themed.softButton]}>
              <Text style={[styles.closeButtonText, themed.accentText]}>Cerrar</Text>
            </Pressable>
          </View>

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
            style={styles.keyboardSafeArea}>
          <ScrollView
            contentContainerStyle={styles.formContent}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled">
            <Text style={[styles.sectionTitle, themed.accentText]}>Cliente</Text>
            <Pressable style={[styles.selectorButton, themed.outlinedSurface]} onPress={() => setClientSelectorVisible(true)}>
              <View>
                <Text style={styles.selectorLabel}>Cliente</Text>
                <Text style={styles.selectorValue}>
                  {selectedClient?.name || form.customer_name || 'Seleccionar cliente'}
                </Text>
              </View>
              <Text style={styles.selectorChevron}>›</Text>
            </Pressable>

            {newClientMode && (
              <View style={[styles.inlinePanel, themed.outlinedSurface]}>
                <Text style={styles.helperText}>Nuevo cliente</Text>
                <TextInput
                  value={form.customer_name}
                  onChangeText={(value) => updateForm('customer_name', value)}
                  placeholder="Nombre del cliente"
                  style={[styles.input, themed.input]}
                  placeholderTextColor="#9a948d"
                />
              </View>
            )}

            <View style={styles.row}>
              <View style={styles.rowItem}>
                <Text style={styles.fieldLabel}>Teléfono</Text>
                <TextInput
                  value={form.phone}
                  onChangeText={(value) => updateForm('phone', value)}
                  placeholder="Teléfono"
                  keyboardType="phone-pad"
                  style={[styles.input, themed.input]}
                  placeholderTextColor="#9a948d"
                />
              </View>
              <View style={styles.rowItem}>
                <FieldButton
                  label="Nacimiento"
                  value={birthdateLabel(form.birthdate)}
                  onPress={() => setBirthdateSelectorVisible(true)}
                />
              </View>
            </View>

            <Text style={[styles.sectionTitle, themed.accentText]}>Horario</Text>
            <View style={styles.row}>
              <FieldButton label="Fecha" value={longDate(form.date)} onPress={() => setFormCalendarVisible(true)} />
              <FieldButton label="Hora" value={form.time || 'Seleccionar'} onPress={() => setTimeSelectorVisible(true)} />
            </View>
            <FieldButton
              label="Duración"
              value={durationLabel(form.duration_hours)}
              onPress={() => setDurationSelectorVisible(true)}
            />

            <Text style={[styles.sectionTitle, themed.accentText]}>Sesión</Text>
            <FieldButton
              label="Tipo de sesión"
              value={selectedSessionType?.name || form.session_type || 'Seleccionar tipo'}
              onPress={() => setSessionSelectorVisible(true)}
            />
            {!form.session_type_uuid && (
              <TextInput
                value={form.session_type}
                onChangeText={(value) => updateForm('session_type', value)}
                placeholder="Tipo manual"
                style={[styles.input, themed.input]}
                placeholderTextColor="#9a948d"
              />
            )}

            <FieldButton
              label="Fotógrafo"
              value={selectedPhotographer?.name || form.photographer_name || 'Seleccionar fotógrafo'}
              onPress={() => setPhotographerSelectorVisible(true)}
            />

            <Text style={[styles.sectionTitle, themed.accentText]}>Anticipo</Text>
            <View style={styles.advanceFormRow}>
              <View style={styles.advanceAmountColumn}>
                <Text style={styles.fieldLabel}>Importe</Text>
                <TextInput
                  value={form.advance_amount}
                  onChangeText={(value) => updateForm('advance_amount', value)}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  style={[styles.input, themed.input]}
                  placeholderTextColor="#9a948d"
                />
              </View>
              <View style={styles.advanceMethodColumn}>
                <Text style={styles.fieldLabel}>Método</Text>
                <View style={styles.paymentChoices}>
                  {[
                    { key: 'cash', label: 'Efectivo' },
                    { key: 'transfer', label: 'Transferencia' },
                  ].map((item) => (
                    <Pressable
                      key={item.key}
                      style={[
                        styles.paymentChoice,
                        themed.paymentChoice,
                        form.advance_payment_method === item.key && themed.paymentChoiceSelected,
                      ]}
                      onPress={() => updateForm('advance_payment_method', item.key)}>
                      <MaterialCommunityIcons
                        name={
                          form.advance_payment_method === item.key
                            ? 'checkbox-marked-circle'
                            : 'checkbox-blank-circle-outline'
                        }
                        color={form.advance_payment_method === item.key ? palette.accent : muted}
                        size={16}
                      />
                      <Text
                        style={[
                          styles.paymentChoiceText,
                          form.advance_payment_method === item.key && themed.accentText,
                        ]}>
                        {item.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>

            <Text style={styles.fieldLabel}>Notas</Text>
            <TextInput
              value={form.note}
              onChangeText={(value) => updateForm('note', value)}
              placeholder="Observaciones de la reserva"
              multiline
              style={[styles.input, themed.input, styles.textArea]}
              placeholderTextColor="#9a948d"
            />

            <Pressable style={styles.receiptButton} onPress={shareReservationReceipt}>
              <MaterialCommunityIcons name="whatsapp" color="#fff" size={19} />
              <Text style={styles.receiptButtonText}>Generar imagen para WhatsApp</Text>
            </Pressable>

            <Pressable style={[styles.primaryButton, themed.primaryButton, styles.saveButton]} onPress={submit} disabled={saving}>
              <Text style={styles.primaryButtonText}>{saving ? 'Guardando...' : 'Guardar reserva'}</Text>
            </Pressable>
          </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      <Modal visible={paletteSelectorVisible} transparent animationType="fade">
        <View style={styles.calendarBackdrop}>
          <View style={[styles.optionsPanel, themed.palettePanel]}>
            <View style={styles.pickerHeader}>
              <View>
                <Text style={[styles.eyebrow, themed.accentText]}>Apariencia</Text>
                <Text style={styles.pickerTitle}>Paleta de colores</Text>
              </View>
              <Pressable style={[styles.closePill, themed.softButton]} onPress={() => setPaletteSelectorVisible(false)}>
                <Text style={[styles.closePillText, themed.accentText]}>Cerrar</Text>
              </Pressable>
            </View>

            <ScrollView
              style={styles.settingsScroll}
              contentContainerStyle={styles.settingsContent}
              showsVerticalScrollIndicator={false}>
            <View style={styles.paletteGrid}>
              {appPalettes.map((item) => {
                const selected = item.id === palette.id;
                return (
                  <Pressable
                    key={item.id}
                    style={[
                      styles.paletteOption,
                      { borderColor: selected ? item.accent : item.line, backgroundColor: item.paper },
                    ]}
                    onPress={() => {
                      setPaletteId(item.id);
                      setPaletteSelectorVisible(false);
                    }}>
                    <View style={styles.paletteSwatches}>
                      <View style={[styles.paletteSwatchLarge, { backgroundColor: item.accent }]} />
                      <View style={[styles.paletteSwatch, { backgroundColor: item.accentSoft }]} />
                      <View style={[styles.paletteSwatch, { backgroundColor: item.ink }]} />
                    </View>
                    <Text style={[styles.paletteName, { color: item.ink }]}>{item.name}</Text>
                    {selected ? <Text style={[styles.paletteSelected, { color: item.accent }]}>Activa</Text> : null}
                  </Pressable>
                );
              })}
            </View>

            <View style={[styles.notificationSettings, themed.outlinedSurface]}>
              <View style={styles.notificationSettingsHeader}>
                <View
                  style={[
                    styles.notificationStatusIcon,
                    themed.softButton,
                  ]}>
                  <MaterialCommunityIcons
                    name={
                      notificationTokenStatus.state === 'success'
                        ? 'bell-check-outline'
                        : notificationTokenStatus.state === 'error'
                          ? 'bell-alert-outline'
                          : 'bell-outline'
                    }
                    color={
                      notificationTokenStatus.state === 'error'
                        ? '#b3261e'
                        : palette.accent
                    }
                    size={22}
                  />
                </View>
                <View style={styles.notificationSettingsText}>
                  <Text style={styles.notificationSettingsTitle}>
                    Notificaciones
                  </Text>
                  <Text
                    style={[
                      styles.notificationSettingsMessage,
                      notificationTokenStatus.state === 'success' &&
                        styles.notificationStatusSuccess,
                      notificationTokenStatus.state === 'error' &&
                        styles.notificationStatusError,
                    ]}>
                    {notificationTokenStatus.message}
                  </Text>
                </View>
              </View>

              {notificationTokenStatus.state === 'success' ? (
                <Text style={styles.notificationTokenValue} numberOfLines={1}>
                  {shortPushToken(notificationTokenStatus.token)}
                </Text>
              ) : null}

              <Pressable
                disabled={notificationTokenStatus.state === 'checking'}
                style={({ pressed }) => [
                  styles.notificationCheckButton,
                  themed.primaryButton,
                  pressed && styles.notificationCheckButtonPressed,
                  notificationTokenStatus.state === 'checking' &&
                    styles.notificationCheckButtonDisabled,
                ]}
                onPress={checkNotificationToken}>
                {notificationTokenStatus.state === 'checking' ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <MaterialCommunityIcons
                    name="shield-check-outline"
                    color="#fff"
                    size={18}
                  />
                )}
                <Text style={styles.notificationCheckButtonText}>
                  {notificationTokenStatus.state === 'checking'
                    ? 'Comprobando'
                    : 'Comprobar token'}
                </Text>
              </Pressable>
            </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <CompactDatePicker
        visible={calendarVisible}
        title="Seleccionar semana"
        selectedDate={selectedDate}
        onClose={() => setCalendarVisible(false)}
        onSelect={(date) => {
          setSelectedDate(date);
          setCalendarVisible(false);
        }}
      />

      <CompactDatePicker
        visible={formCalendarVisible}
        title="Fecha de reserva"
        selectedDate={form.date}
        validRange={{ startDate: dateFromIso(todayIsoDate()) }}
        onClose={() => setFormCalendarVisible(false)}
        onSelect={(date) => {
          updateForm('date', date);
          setFormCalendarVisible(false);
        }}
      />

      <PickerModal
        visible={clientSelectorVisible}
        title="Seleccionar cliente"
        search={clientSearch}
        onSearch={setClientSearch}
        onClose={() => setClientSelectorVisible(false)}
        actionLabel="Agregar cliente nuevo"
        onAction={startNewClient}
        items={filteredClients.map((client) => ({
          key: client.sync_uuid,
          title: client.name,
          subtitle: client.phone || 'Sin teléfono',
          selected: client.sync_uuid === form.partner_uuid,
          onPress: () => selectClient(client),
        }))}
      />

      <PickerModal
        visible={sessionSelectorVisible}
        title="Tipo de sesión"
        search={sessionSearch}
        onSearch={setSessionSearch}
        onClose={() => setSessionSelectorVisible(false)}
        actionLabel="Usar tipo manual"
        onAction={() => {
          setForm((current) => ({ ...current, session_type_uuid: '' }));
          setSessionSelectorVisible(false);
        }}
        items={filteredSessionTypes.map((sessionType) => ({
          key: sessionType.sync_uuid,
          title: sessionType.name,
          subtitle: `${durationLabel(String(sessionType.duration_hours || 1))}`,
          selected: sessionType.sync_uuid === form.session_type_uuid,
          onPress: () => selectSessionType(sessionType),
        }))}
      />

      <PickerModal
        visible={photographerSelectorVisible}
        title="Fotógrafo"
        search={photographerSearch}
        onSearch={setPhotographerSearch}
        onClose={() => setPhotographerSelectorVisible(false)}
        actionLabel="Sin fotógrafo"
        onAction={() => {
          setForm((current) => ({ ...current, photographer_uuid: '', photographer_name: '' }));
          setPhotographerSelectorVisible(false);
        }}
        items={filteredPhotographers.map((photographer) => ({
          key: photographer.sync_uuid,
          title: photographer.name,
          selected: photographer.sync_uuid === form.photographer_uuid,
          onPress: () => selectPhotographer(photographer),
        }))}
      />

      <TimePickerModal
        visible={timeSelectorVisible}
        locale="es"
        label="Hora de inicio"
        cancelLabel="Cancelar"
        confirmLabel="Seleccionar"
        hours={timeParts(form.time).hours}
        minutes={timeParts(form.time).minutes}
        use24HourClock
        defaultInputType="keyboard"
        onDismiss={() => setTimeSelectorVisible(false)}
        onConfirm={({ hours, minutes }) => {
          updateForm('time', `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`);
          setTimeSelectorVisible(false);
        }}
      />

      <OptionsModal
        visible={durationSelectorVisible}
        title="Duración"
        options={durationOptions.map((item) => item.value)}
        labels={Object.fromEntries(durationOptions.map((item) => [item.value, item.label]))}
        selected={form.duration_hours}
        onClose={() => setDurationSelectorVisible(false)}
        onSelect={(value) => {
          updateForm('duration_hours', value);
          setDurationSelectorVisible(false);
        }}
      />

      <CompactDatePicker
        visible={birthdateSelectorVisible}
        title="Fecha de nacimiento"
        selectedDate={form.birthdate || defaultBirthdate()}
        startYear={1900}
        endYear={new Date().getFullYear()}
        validRange={{ endDate: new Date() }}
        onClose={() => setBirthdateSelectorVisible(false)}
        onSelect={(date) => {
          updateForm('birthdate', date);
          setBirthdateSelectorVisible(false);
        }}
      />
      <View pointerEvents="none" style={styles.receiptCaptureWrap}>
        <ReservationReceipt ref={receiptRef} form={form} />
      </View>
    </SafeAreaView>
    </PaperProvider>
  );
}

function ReservationCard({
  reservation,
  onPress,
  onDelete,
  deleting,
}: {
  reservation: Reservation;
  onPress: () => void;
  onDelete: () => void;
  deleting?: boolean;
}) {
  const { palette } = useAppPalette();
  const themed = useMemo(() => makeThemedStyles(palette), [palette]);
  const age = ageAtReservation(reservation);
  return (
    <Pressable onPress={onPress} style={[styles.card, themed.card]}>
      <View style={styles.cardBody}>
        <View style={[styles.cardTimeHighlight, themed.cardTimeHighlight]}>
          <View style={styles.cardTimeLeft}>
            <MaterialCommunityIcons name="clock-outline" color="#fff" size={16} />
            <Text style={[styles.cardTimeTextPill, themed.cardTimeTextPill]}>{timeRange(reservation)}</Text>
          </View>
          <Pressable
            disabled={deleting}
            accessibilityLabel="Eliminar reserva"
            style={({ pressed }) => [
              styles.cardDeleteButton,
              pressed && styles.cardDeleteButtonPressed,
              deleting && styles.cardDeleteButtonDisabled,
            ]}
            onPress={(event) => {
              event.stopPropagation();
              onDelete();
            }}>
            {deleting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <MaterialCommunityIcons name="trash-can-outline" color="#fff" size={19} />
            )}
          </Pressable>
        </View>

        <View style={styles.cardClientHeader}>
          <View style={styles.cardPersonBlock}>
            <CardInfoRow icon="account-outline" text={reservation.customer_name} title />
            <View style={styles.cardInlineRow}>
              {!!age && <CardInfoRow icon="cake-variant-outline" text={age} muted inline />}
              {!!reservation.phone && <CardInfoRow icon="phone-outline" text={reservation.phone} phone inline />}
            </View>
          </View>
          <Pressable
            style={[styles.whatsappButton, !reservation.phone && styles.whatsappButtonDisabled]}
            onPress={(event) => {
              event.stopPropagation();
              openReservationWhatsApp(reservation);
            }}>
            <MaterialCommunityIcons name="whatsapp" color={reservation.phone ? '#fff' : muted} size={20} />
          </Pressable>
        </View>

        <View style={[styles.cardSessionPanel, themed.cardSessionPanel]}>
          <CardInfoRow icon="tag-outline" text={reservation.session_type || 'Sin tipo'} session />
          <View style={styles.cardPanelBottomRow}>
            <View style={styles.cardPhotographerSlot}>
              <CardInfoRow icon="camera-outline" text={reservation.photographer_name || 'Sin fotógrafo'} compact muted />
            </View>
            {!!reservation.advance_amount && (
              <View style={styles.advanceBadge}>
                <MaterialCommunityIcons name="cash-check" color={green} size={14} />
                <Text style={styles.advanceText}>${reservation.advance_amount}</Text>
              </View>
            )}
          </View>
          {!!cleanNote(reservation.note) && (
            <CardInfoRow icon="note-text-outline" text={cleanNote(reservation.note)} compact muted />
          )}
        </View>
      </View>
    </Pressable>
  );
}

const ReservationReceipt = forwardRef<View, { form: ReservationForm }>(function ReservationReceipt({ form }, ref) {
  const sessionAge = preciseAgeAtDate(form.birthdate, form.date);
  return (
    <View ref={ref} collapsable={false} style={styles.receiptCard}>
      <View style={styles.receiptHeader}>
        <Text style={styles.receiptBrand}>La Fotería</Text>
        <Text style={styles.receiptTitle}>Recibo de reserva</Text>
      </View>

      <View style={styles.receiptSection}>
        <Text style={styles.receiptLabel}>Cliente</Text>
        <Text style={styles.receiptCustomer}>{form.customer_name || 'Cliente sin nombre'}</Text>
        {!!form.phone && <Text style={styles.receiptMuted}>Tel. {form.phone}</Text>}
        {!!form.birthdate && (
          <View style={styles.receiptBirthBox}>
            <Text style={styles.receiptLabel}>Fecha de nacimiento</Text>
            <Text style={styles.receiptBirthDate}>{fullDate(form.birthdate)}</Text>
            <View style={styles.receiptAgeRow}>
              {!!sessionAge && <Text style={styles.receiptAgePill}>Edad en sesión: {sessionAge}</Text>}
            </View>
          </View>
        )}
      </View>

      <View style={styles.receiptDivider} />

      <View style={styles.receiptGrid}>
        <ReceiptField label="Fecha" value={longDate(form.date)} />
        <ReceiptField label="Horario" value={form.time || 'Sin hora'} />
        <ReceiptField label="Sesión" value={form.session_type || 'Sin tipo'} wide />
      </View>

      <View style={styles.receiptPaymentBox}>
        <View>
          <Text style={styles.receiptLabel}>Anticipo</Text>
          <Text style={styles.receiptAmount}>${form.advance_amount || '0.00'}</Text>
        </View>
        <View style={styles.receiptPaymentMethod}>
          <Text style={styles.receiptLabel}>Método</Text>
          <Text style={styles.receiptPaymentText}>{paymentMethodLabel(form.advance_payment_method)}</Text>
        </View>
      </View>

      {!!cleanNote(form.note) && (
        <View style={styles.receiptNotesBox}>
          <Text style={styles.receiptLabel}>Notas</Text>
          <Text style={styles.receiptNotesText}>{cleanNote(form.note)}</Text>
        </View>
      )}

      <Text style={styles.receiptFooter}>Reserva registrada. Le esperamos en La Fotería.</Text>
    </View>
  );
});

function ReceiptField({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <View style={[styles.receiptField, wide && styles.receiptFieldWide]}>
      <Text style={styles.receiptLabel}>{label}</Text>
      <Text style={styles.receiptValue}>{value}</Text>
    </View>
  );
}

function paymentMethodLabel(value: string) {
  if (value === 'cash') {
    return 'Efectivo';
  }
  if (value === 'transfer') {
    return 'Transferencia';
  }
  return 'No especificado';
}

function cleanNote(value: unknown) {
  if (value === false || value === null || value === undefined) {
    return '';
  }
  const text = String(value).trim();
  if (!text || text.toLowerCase() === 'false') {
    return '';
  }
  return text;
}

function openReservationWhatsApp(reservation: Reservation) {
  const phone = normalizePhoneForWhatsApp(reservation.phone || '');
  if (!phone) {
    Alert.alert('Sin teléfono', 'Este cliente no tiene un número de teléfono registrado.');
    return;
  }
  const message = [
    `Hola ${reservation.customer_name}.`,
    `Le recordamos su sesión fotográfica en La Fotería para el ${longDate(dateKey(reservation))} a las ${timeRange(reservation)}.`,
    'Le esperamos.',
  ].join(' ');
  Linking.openURL(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`).catch(() => {
    Alert.alert('No se pudo abrir WhatsApp', 'Verifica que WhatsApp esté instalado o disponible en este dispositivo.');
  });
}

function openFormReceiptWhatsApp(form: ReservationForm) {
  const phone = normalizePhoneForWhatsApp(form.phone || '');
  if (!phone) {
    Alert.alert('Sin teléfono', 'Selecciona un cliente con teléfono o introduce un número antes de enviar el recibo.');
    return;
  }
  if (!form.customer_name.trim()) {
    Alert.alert('Falta el cliente', 'Selecciona o introduce el nombre del cliente antes de enviar el recibo.');
    return;
  }
  const paymentMethod = form.advance_payment_method
    ? form.advance_payment_method === 'cash'
      ? 'Efectivo'
      : 'Transferencia'
    : 'No especificado';
  const lines = [
    'RECIBO DE RESERVA',
    'La Fotería',
    '',
    `Cliente: ${form.customer_name.trim()}`,
    form.phone ? `Teléfono: ${form.phone.trim()}` : '',
    form.birthdate ? `Nacimiento: ${longDate(form.birthdate)}` : '',
    `Fecha: ${longDate(form.date)}`,
    `Horario: ${form.time}`,
    `Tipo de sesión: ${form.session_type || 'Sin tipo'}`,
    `Anticipo: ${form.advance_amount || '0.00'}`,
    `Método de pago: ${paymentMethod}`,
    '',
    'Reserva registrada. Le esperamos en La Fotería.',
  ].filter(Boolean);
  Linking.openURL(`https://wa.me/${phone}?text=${encodeURIComponent(lines.join('\n'))}`).catch(() => {
    Alert.alert('No se pudo abrir WhatsApp', 'Verifica que WhatsApp esté instalado o disponible en este dispositivo.');
  });
}

function normalizePhoneForWhatsApp(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (!digits) {
    return '';
  }
  return digits;
}

function CardInfoRow({
  icon,
  text,
  title,
  muted: mutedText,
  phone,
  accent,
  time,
  compact,
  inline,
  session,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  text: string;
  title?: boolean;
  muted?: boolean;
  phone?: boolean;
  accent?: boolean;
  time?: boolean;
  compact?: boolean;
  inline?: boolean;
  session?: boolean;
}) {
  const { palette } = useAppPalette();
  const themed = useMemo(() => makeThemedStyles(palette), [palette]);
  return (
    <View style={[styles.cardInfoRow, inline && styles.cardInfoInline, title && styles.cardInfoTitleRow]}>
      <MaterialCommunityIcons
        name={icon}
        color={time ? '#fff' : accent ? palette.accent : phone ? green : mutedText ? muted : ink}
        size={title ? 19 : session ? 17 : compact || inline ? 14 : 16}
      />
      <Text
        style={[
          styles.cardInfoText,
          time && styles.cardTimeTextPill,
          title && styles.cardInfoTitle,
          compact && styles.cardInfoCompact,
          inline && styles.cardInfoInlineText,
          session && styles.cardInfoSession,
          mutedText && styles.cardInfoMuted,
          phone && styles.cardInfoPhone,
          accent && themed.accentText,
          time && themed.cardInfoTime,
        ]}
        numberOfLines={title ? 2 : 1}>
        {text}
      </Text>
    </View>
  );
}

function FieldButton({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  const { palette } = useAppPalette();
  const themed = useMemo(() => makeThemedStyles(palette), [palette]);
  return (
    <Pressable style={[styles.selectorButton, themed.outlinedSurface]} onPress={onPress}>
      <View style={styles.selectorTextBlock}>
        <Text style={styles.selectorLabel}>{label}</Text>
        <Text style={styles.selectorValue} numberOfLines={1}>
          {value}
        </Text>
      </View>
      <Text style={styles.selectorChevron}>›</Text>
    </Pressable>
  );
}

function PickerModal({
  visible,
  title,
  search,
  onSearch,
  onClose,
  items,
  actionLabel,
  onAction,
}: {
  visible: boolean;
  title: string;
  search: string;
  onSearch: (value: string) => void;
  onClose: () => void;
  items: { key: string; title: string; subtitle?: string; selected?: boolean; onPress: () => void }[];
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { palette } = useAppPalette();
  const themed = useMemo(() => makeThemedStyles(palette), [palette]);
  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={styles.calendarBackdrop} onPress={onClose}>
        <Pressable style={[styles.pickerPanel, themed.palettePanel]}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>{title}</Text>
            <Pressable onPress={onClose} style={[styles.closePill, themed.softButton]}>
              <Text style={[styles.closePillText, themed.accentText]}>Cerrar</Text>
            </Pressable>
          </View>
          <TextInput
            value={search}
            onChangeText={onSearch}
            placeholder="Buscar"
            style={[styles.searchInput, themed.input]}
            placeholderTextColor="#9a948d"
          />
          {!!actionLabel && !!onAction && (
            <Pressable style={[styles.modalAction, { borderColor: palette.accent }]} onPress={onAction}>
              <Text style={[styles.modalActionText, themed.accentText]}>{actionLabel}</Text>
            </Pressable>
          )}
          <ScrollView style={styles.pickerList} contentContainerStyle={styles.pickerListContent}>
            {items.length ? (
              items.map((item) => (
                <Pressable
                  key={item.key}
                  style={[styles.pickerItem, themed.outlinedSurface, item.selected && themed.paymentChoiceSelected]}
                  onPress={item.onPress}>
                  <View style={styles.selectorTextBlock}>
                    <Text style={[styles.pickerItemTitle, item.selected && themed.accentText]}>
                      {item.title}
                    </Text>
                    {!!item.subtitle && <Text style={styles.pickerItemSubtitle}>{item.subtitle}</Text>}
                  </View>
                  {item.selected && <Text style={styles.pickerCheck}>✓</Text>}
                </Pressable>
              ))
            ) : (
              <Text style={styles.emptyText}>Sin resultados.</Text>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function OptionsModal({
  visible,
  title,
  options,
  labels = {},
  selected,
  onClose,
  onSelect,
}: {
  visible: boolean;
  title: string;
  options: string[];
  labels?: Record<string, string>;
  selected: string;
  onClose: () => void;
  onSelect: (value: string) => void;
}) {
  const { palette } = useAppPalette();
  const themed = useMemo(() => makeThemedStyles(palette), [palette]);
  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={styles.calendarBackdrop} onPress={onClose}>
        <Pressable style={[styles.optionsPanel, themed.palettePanel]}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>{title}</Text>
            <Pressable onPress={onClose} style={[styles.closePill, themed.softButton]}>
              <Text style={[styles.closePillText, themed.accentText]}>Cerrar</Text>
            </Pressable>
          </View>
          <View style={styles.optionGrid}>
            {options.map((option) => (
              <Pressable
                key={option}
                style={[styles.optionButton, themed.outlinedSurface, selected === option && themed.primaryButton]}
                onPress={() => onSelect(option)}>
                <Text style={[styles.optionText, selected === option && styles.optionTextSelected]}>
                  {labels[option] || option}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function CompactDatePicker({
  visible,
  title,
  selectedDate,
  validRange,
  startYear,
  endYear,
  onClose,
  onSelect,
}: {
  visible: boolean;
  title: string;
  selectedDate: string;
  validRange?: { startDate?: Date; endDate?: Date; disabledDates?: Date[] };
  startYear?: number;
  endYear?: number;
  onClose: () => void;
  onSelect: (value: string) => void;
}) {
  const { palette } = useAppPalette();
  const themed = useMemo(() => makeThemedStyles(palette), [palette]);
  const [draftDate, setDraftDate] = useState<Date | undefined>(dateFromIso(selectedDate));

  useEffect(() => {
    if (visible) {
      setDraftDate(dateFromIso(selectedDate));
    }
  }, [selectedDate, visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.calendarBackdrop} onPress={onClose}>
        <Pressable style={[styles.compactDatePanel, themed.palettePanel]}>
          <View style={styles.compactDateHeader}>
            <View>
              <Text style={[styles.eyebrow, themed.accentText]}>Calendario</Text>
              <Text style={[styles.compactDateTitle, themed.title]}>{title}</Text>
            </View>
            <Pressable onPress={onClose} style={[styles.closePill, themed.softButton]}>
              <Text style={[styles.closePillText, themed.accentText]}>Cerrar</Text>
            </Pressable>
          </View>

          <View style={styles.compactCalendarBody}>
            <Calendar
              locale="es"
              mode="single"
              date={draftDate}
              startWeekOnMonday
              validRange={validRange}
              startYear={startYear}
              endYear={endYear}
              onChange={({ date }) => {
                if (date) {
                  setDraftDate(date);
                }
              }}
            />
          </View>

          <View style={styles.compactDateActions}>
            <Pressable style={styles.compactCancelButton} onPress={onClose}>
              <Text style={styles.compactCancelText}>Cancelar</Text>
            </Pressable>
            <Pressable
              style={[styles.compactConfirmButton, themed.primaryButton]}
              onPress={() => {
                if (draftDate) {
                  onSelect(isoFromDate(draftDate));
                }
              }}>
              <Text style={styles.compactConfirmText}>Seleccionar</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function BirthdateModal({
  visible,
  selectedDate,
  onClose,
  onSelect,
}: {
  visible: boolean;
  selectedDate: string;
  onClose: () => void;
  onSelect: (value: string) => void;
}) {
  const initial = parseBirthdate(selectedDate);
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [day, setDay] = useState(initial.day);

  useEffect(() => {
    if (visible) {
      const parsed = parseBirthdate(selectedDate);
      setYear(parsed.year);
      setMonth(parsed.month);
      setDay(parsed.day);
    }
  }, [selectedDate, visible]);

  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: currentYear - 1919 }, (_, index) => String(currentYear - index));
  }, []);
  const days = useMemo(() => {
    const total = daysInMonth(year, month);
    return Array.from({ length: total }, (_, index) => String(index + 1));
  }, [month, year]);

  const safeDay = Math.min(day, daysInMonth(year, month));
  const selectedValue = formatDateParts(year, month, safeDay);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={styles.calendarBackdrop} onPress={onClose}>
        <Pressable style={styles.birthdatePanel}>
          <View style={styles.pickerHeader}>
            <View>
              <Text style={styles.eyebrow}>Cliente</Text>
              <Text style={styles.pickerTitle}>Fecha de nacimiento</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closePill}>
              <Text style={styles.closePillText}>Cerrar</Text>
            </Pressable>
          </View>

          <Text style={styles.birthdatePreview}>{longDate(selectedValue)}</Text>

          <View style={styles.datePartsRow}>
            <DatePartColumn
              title="Día"
              options={days}
              selected={String(safeDay)}
              onSelect={(value) => setDay(Number(value))}
            />
            <DatePartColumn
              title="Mes"
              options={monthOptions.map((item) => item.value)}
              labels={Object.fromEntries(monthOptions.map((item) => [item.value, item.label]))}
              selected={String(month)}
              onSelect={(value) => {
                const nextMonth = Number(value);
                setMonth(nextMonth);
                setDay((currentDay) => Math.min(currentDay, daysInMonth(year, nextMonth)));
              }}
            />
            <DatePartColumn title="Año" options={years} selected={String(year)} onSelect={(value) => setYear(Number(value))} />
          </View>

          <Pressable style={[styles.primaryButton, styles.birthdateConfirm]} onPress={() => onSelect(selectedValue)}>
            <Text style={styles.primaryButtonText}>Seleccionar fecha</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function DatePartColumn({
  title,
  options,
  labels = {},
  selected,
  onSelect,
}: {
  title: string;
  options: string[];
  labels?: Record<string, string>;
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <View style={styles.datePartColumn}>
      <Text style={styles.datePartTitle}>{title}</Text>
      <ScrollView style={styles.datePartScroll} showsVerticalScrollIndicator={false}>
        {options.map((option) => (
          <Pressable
            key={option}
            style={[styles.datePartOption, selected === option && styles.datePartOptionSelected]}
            onPress={() => onSelect(option)}>
            <Text style={[styles.datePartText, selected === option && styles.datePartTextSelected]}>
              {labels[option] || option}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function CalendarModal({
  visible,
  title,
  month,
  selectedDate,
  highlightedDays,
  reservations,
  onMonthChange,
  onClose,
  onSelect,
}: {
  visible: boolean;
  title: string;
  month: string;
  selectedDate: string;
  highlightedDays: string[];
  reservations: Reservation[];
  onMonthChange: (month: string) => void;
  onClose: () => void;
  onSelect: (day: string) => void;
}) {
  const days = useMemo(() => monthGrid(month), [month]);
  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={styles.calendarBackdrop} onPress={onClose}>
        <Pressable style={styles.calendarPanel}>
          <View style={styles.calendarHeader}>
            <Pressable style={styles.calendarNav} onPress={() => onMonthChange(shiftMonth(month, -1))}>
              <Text style={styles.calendarNavText}>{'<'}</Text>
            </Pressable>
            <View style={styles.calendarTitleBlock}>
              <Text style={styles.eyebrow}>{title}</Text>
              <Text style={styles.calendarTitle}>{monthLabel(month)}</Text>
            </View>
            <Pressable style={styles.calendarNav} onPress={() => onMonthChange(shiftMonth(month, 1))}>
              <Text style={styles.calendarNavText}>{'>'}</Text>
            </Pressable>
          </View>

          <View style={styles.calendarWeekdays}>
            {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((label, index) => (
              <Text key={`${label}-${index}`} style={styles.calendarWeekday}>
                {label}
              </Text>
            ))}
          </View>

          <View style={styles.calendarGrid}>
            {days.map((day) => {
              const inMonth = day.slice(0, 7) === month;
              const inHighlightedRange = highlightedDays.includes(day);
              const count = reservations.filter((reservation) => dateKey(reservation) === day).length;
              return (
                <Pressable
                  key={day}
                  style={[
                    styles.calendarDay,
                    !inMonth && styles.calendarDayMuted,
                    inHighlightedRange && styles.calendarDaySelectedWeek,
                    day === selectedDate && styles.calendarDaySelected,
                  ]}
                  onPress={() => onSelect(day)}>
                  <Text
                    style={[
                      styles.calendarDayText,
                      !inMonth && styles.calendarDayTextMuted,
                      day === selectedDate && styles.calendarDayTextSelected,
                    ]}>
                    {Number(day.slice(8, 10))}
                  </Text>
                  {count ? <Text style={styles.calendarDayCount}>{count}</Text> : null}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function monthKey(date: string) {
  return date.slice(0, 7);
}

function monthLabel(month: string) {
  return new Intl.DateTimeFormat('es-CU', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${month}-01T12:00:00`));
}

function shortDate(date: string) {
  return new Intl.DateTimeFormat('es-CU', {
    day: '2-digit',
    month: 'short',
  }).format(new Date(`${date}T12:00:00`));
}

function longDate(date: string) {
  if (!date) {
    return 'Seleccionar fecha';
  }
  return new Intl.DateTimeFormat('es-CU', {
    weekday: 'short',
    day: '2-digit',
    month: 'long',
  }).format(new Date(`${date}T12:00:00`));
}

function fullDate(date: string) {
  if (!date) {
    return 'Sin fecha';
  }
  return new Intl.DateTimeFormat('es-CU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${date}T12:00:00`));
}

function birthdateLabel(date: string) {
  if (!date) {
    return 'Seleccionar';
  }
  return longDate(date);
}

function ageAtReservation(reservation: Reservation) {
  return ageAtDate(reservation.birthdate || '', dateKey(reservation));
}

function ageAtDate(birthdate: string, referenceDate: string) {
  if (!birthdate) {
    return '';
  }
  const birth = dateFromIso(birthdate);
  const reference = dateFromIso(referenceDate) || new Date();
  if (!birth || birth > reference) {
    return '';
  }
  let years = reference.getFullYear() - birth.getFullYear();
  let months = reference.getMonth() - birth.getMonth();
  if (reference.getDate() < birth.getDate()) {
    months -= 1;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years > 0) {
    return `${years} ${years === 1 ? 'año' : 'años'}`;
  }
  return `${months} ${months === 1 ? 'mes' : 'meses'}`;
}

function preciseAgeAtDate(birthdate: string, referenceDate: string) {
  const birth = dateFromIso(birthdate);
  const reference = dateFromIso(referenceDate) || new Date();
  if (!birth || birth > reference) {
    return '';
  }

  let years = reference.getFullYear() - birth.getFullYear();
  let months = reference.getMonth() - birth.getMonth();
  let days = reference.getDate() - birth.getDate();

  if (days < 0) {
    months -= 1;
    const previousMonth = new Date(reference.getFullYear(), reference.getMonth(), 0);
    days += previousMonth.getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const parts = [
    years ? `${years} ${years === 1 ? 'año' : 'años'}` : '',
    months ? `${months} ${months === 1 ? 'mes' : 'meses'}` : '',
    days || (!years && !months) ? `${days} ${days === 1 ? 'día' : 'días'}` : '',
  ].filter(Boolean);
  return parts.join(', ');
}

function dateFromIso(date: string) {
  if (!date) {
    return undefined;
  }
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) {
    return undefined;
  }
  return new Date(year, month - 1, day, 12, 0, 0);
}

function isoFromDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

function shiftIsoDate(date: string, amount: number) {
  const current = dateFromIso(date) || new Date();
  current.setDate(current.getDate() + amount);
  return isoFromDate(current);
}

function defaultBirthdate() {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 15);
  return isoFromDate(date);
}

function timeParts(value: string) {
  const [rawHours, rawMinutes] = (value || '09:00').split(':').map(Number);
  return {
    hours: Number.isFinite(rawHours) ? rawHours : 9,
    minutes: Number.isFinite(rawMinutes) ? rawMinutes : 0,
  };
}

function durationLabel(value: string) {
  const match = durationOptions.find((item) => item.value === value);
  if (match) {
    return match.label;
  }
  const duration = normalizeDurationHours(value);
  if (duration < 1) {
    const minutes = Math.round(duration * 60);
    return `${minutes} minutos`;
  }
  if (Number.isInteger(duration)) {
    return `${duration} h`;
  }
  const hours = Math.floor(duration);
  const minutes = Math.round((duration - hours) * 60);
  return hours ? `${hours} h ${minutes} min` : `${minutes} minutos`;
}

const monthOptions = [
  { value: '1', label: 'Ene' },
  { value: '2', label: 'Feb' },
  { value: '3', label: 'Mar' },
  { value: '4', label: 'Abr' },
  { value: '5', label: 'May' },
  { value: '6', label: 'Jun' },
  { value: '7', label: 'Jul' },
  { value: '8', label: 'Ago' },
  { value: '9', label: 'Sep' },
  { value: '10', label: 'Oct' },
  { value: '11', label: 'Nov' },
  { value: '12', label: 'Dic' },
];

function parseBirthdate(date: string) {
  const fallback = new Date();
  const fallbackYear = fallback.getFullYear() - 15;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
  if (!match) {
    return { year: fallbackYear, month: 1, day: 1 };
  }
  const year = Number(match[1]);
  const month = Math.min(Math.max(Number(match[2]), 1), 12);
  const day = Math.min(Math.max(Number(match[3]), 1), daysInMonth(year, month));
  return { year, month, day };
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function formatDateParts(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function shiftMonth(month: string, amount: number) {
  const date = new Date(`${month}-01T12:00:00`);
  date.setMonth(date.getMonth() + amount);
  return date.toISOString().slice(0, 7);
}

function monthGrid(month: string) {
  const first = new Date(`${month}-01T12:00:00`);
  const startOffset = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - startOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date.toISOString().slice(0, 10);
  });
}

function filterByText<T>(items: T[], query: string, getText: (item: T) => string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return items;
  }
  return items.filter((item) => getText(item).toLowerCase().includes(normalized));
}

function currentDurationFallback(value: string) {
  return Number(value) || 1;
}

function shortPushToken(token: string) {
  if (token.length <= 34) {
    return token;
  }
  return `${token.slice(0, 22)}...${token.slice(-8)}`;
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
    paletteButton: {
      borderColor: palette.line,
      backgroundColor: '#fff',
    },
    outlinedSurface: {
      borderColor: palette.line,
      backgroundColor: '#fff',
    },
    softButton: {
      backgroundColor: palette.accentSoft,
    },
    primaryButton: {
      backgroundColor: palette.accent,
    },
    modalHeader: {
      borderBottomColor: palette.line,
    },
    input: {
      borderColor: palette.line,
      backgroundColor: '#fff',
      color: palette.ink,
    },
    paymentChoice: {
      borderColor: palette.line,
      backgroundColor: '#fff',
    },
    paymentChoiceSelected: {
      borderColor: palette.accent,
      backgroundColor: palette.accentSoft,
    },
    dayButton: {
      borderColor: palette.line,
      backgroundColor: '#fff',
    },
    dayButtonSelected: {
      backgroundColor: palette.accent,
      borderColor: palette.accent,
    },
    palettePanel: {
      borderColor: palette.line,
      backgroundColor: palette.paper,
    },
    card: {
      borderColor: palette.line,
      borderLeftColor: palette.accent,
    },
    cardTimeHighlight: {
      backgroundColor: palette.accent,
    },
    cardTimeTextPill: {
      color: palette.accent,
    },
    cardSessionPanel: {
      backgroundColor: palette.accentSoft,
      borderColor: palette.line,
    },
    cardInfoTime: {
      color: palette.accent,
    },
  });
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: paper,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  paletteButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    color: brick,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  title: {
    color: ink,
    fontSize: 28,
    fontWeight: '800',
  },
  primaryButton: {
    backgroundColor: brick,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '800',
  },
  paletteGrid: {
    gap: 10,
  },
  paletteOption: {
    minHeight: 72,
    borderRadius: 10,
    borderWidth: 2,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  paletteSwatches: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  paletteSwatchLarge: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  paletteSwatch: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  paletteName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '900',
  },
  paletteSelected: {
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  settingsScroll: {
    maxHeight: 560,
  },
  settingsContent: {
    gap: 16,
    paddingBottom: 2,
  },
  notificationSettings: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    gap: 12,
  },
  notificationSettingsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  notificationStatusIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationSettingsText: {
    flex: 1,
    gap: 2,
  },
  notificationSettingsTitle: {
    color: ink,
    fontSize: 15,
    fontWeight: '900',
  },
  notificationSettingsMessage: {
    color: muted,
    fontSize: 12,
    lineHeight: 17,
  },
  notificationStatusSuccess: {
    color: green,
  },
  notificationStatusError: {
    color: '#b3261e',
  },
  notificationTokenValue: {
    color: muted,
    fontSize: 11,
    fontWeight: '700',
    backgroundColor: '#f7f7f8',
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  notificationCheckButton: {
    minHeight: 44,
    borderRadius: 8,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  notificationCheckButtonPressed: {
    opacity: 0.82,
  },
  notificationCheckButtonDisabled: {
    opacity: 0.65,
  },
  notificationCheckButtonText: {
    color: '#fff',
    fontWeight: '900',
  },
  weekStrip: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  calendarSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  calendarSelector: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: line,
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  calendarSelectorLabel: {
    color: muted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  calendarSelectorValue: {
    color: ink,
    fontSize: 16,
    fontWeight: '900',
    marginTop: 2,
  },
  todayButton: {
    borderRadius: 8,
    backgroundColor: soft,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  todayButtonText: {
    color: brick,
    fontWeight: '900',
  },
  dayButton: {
    flex: 1,
    minHeight: 62,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: line,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
  },
  dayButtonSelected: {
    backgroundColor: brick,
    borderColor: brick,
  },
  dayButtonEmpty: {
    backgroundColor: '#f2f2f2',
    borderColor: '#ececec',
    opacity: 0.78,
  },
  dayLabel: {
    color: muted,
    fontSize: 11,
    textAlign: 'center',
    textTransform: 'capitalize',
  },
  dayLabelSelected: {
    color: '#fff',
  },
  dayCount: {
    marginTop: 4,
    color: ink,
    fontSize: 18,
    fontWeight: '800',
  },
  dayCountEmpty: {
    color: '#b8b8b8',
  },
  listContent: {
    padding: 20,
    paddingBottom: 100,
    gap: 12,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: line,
    borderLeftWidth: 6,
    borderLeftColor: brick,
    marginLeft: 6,
    padding: 14,
  },
  cardBody: {
    flex: 1,
    gap: 10,
  },
  cardPersonBlock: {
    flex: 1,
    gap: 5,
    justifyContent: 'center',
    minWidth: 0,
  },
  cardClientHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    paddingRight: 4,
  },
  whatsappButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#25d366',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginRight: 4,
  },
  whatsappButtonDisabled: {
    backgroundColor: '#edf0f2',
  },
  cardInlineRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 14,
    rowGap: 4,
  },
  cardSessionPanel: {
    gap: 6,
    borderRadius: 8,
    backgroundColor: soft,
    borderWidth: 1,
    borderColor: '#ead3ce',
    padding: 10,
    justifyContent: 'center',
    marginTop: 2,
  },
  cardPanelBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    width: '100%',
  },
  cardPhotographerSlot: {
    flex: 1,
    minWidth: 0,
  },
  cardInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  cardInfoTitleRow: {
    flex: 1,
  },
  cardInfoInline: {
    flexShrink: 1,
  },
  cardInfoText: {
    flex: 1,
    color: ink,
    fontSize: 14,
    fontWeight: '700',
  },
  cardInfoTitle: {
    fontSize: 17,
    fontWeight: '900',
  },
  cardInfoCompact: {
    fontSize: 12,
    fontWeight: '800',
  },
  cardInfoInlineText: {
    flex: 0,
    fontSize: 13,
  },
  cardInfoSession: {
    fontSize: 15,
    fontWeight: '900',
  },
  cardInfoMuted: {
    color: muted,
  },
  cardInfoPhone: {
    color: green,
    fontWeight: '800',
  },
  cardInfoAccent: {
    color: brick,
    fontWeight: '900',
  },
  cardInfoTime: {
    color: brick,
    fontWeight: '900',
  },
  cardTimeTextPill: {
    flex: 0,
    backgroundColor: '#fff',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  cardTimeHighlight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 7,
    backgroundColor: brick,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    alignSelf: 'stretch',
  },
  cardTimeLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  cardDeleteButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    flexShrink: 0,
  },
  cardDeleteButtonPressed: {
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  cardDeleteButtonDisabled: {
    opacity: 0.65,
  },
  advanceBadge: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 8,
    backgroundColor: '#edf7f0',
    paddingHorizontal: 7,
    paddingVertical: 6,
    marginTop: 2,
  },
  advanceText: {
    color: green,
    fontSize: 12,
    fontWeight: '800',
  },
  emptyState: {
    minHeight: 260,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: line,
    padding: 24,
  },
  emptyTitle: {
    color: ink,
    fontSize: 20,
    fontWeight: '800',
  },
  emptyText: {
    color: muted,
    textAlign: 'center',
  },
  secondaryButton: {
    marginTop: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: brick,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  secondaryButtonText: {
    color: brick,
    fontWeight: '800',
  },
  modalScreen: {
    flex: 1,
    backgroundColor: paper,
  },
  keyboardSafeArea: {
    flex: 1,
  },
  modalHeader: {
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    color: ink,
    fontSize: 26,
    fontWeight: '900',
  },
  closeButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  closeButtonText: {
    color: brick,
    fontWeight: '800',
  },
  formContent: {
    paddingHorizontal: 20,
    paddingBottom: 48,
    gap: 9,
  },
  sectionTitle: {
    color: brick,
    fontSize: 13,
    fontWeight: '900',
    marginTop: 16,
    textTransform: 'uppercase',
  },
  fieldLabel: {
    color: ink,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 8,
  },
  input: {
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: line,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    color: ink,
  },
  textArea: {
    minHeight: 92,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  rowItem: {
    flex: 1,
  },
  advanceFormRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  advanceAmountColumn: {
    width: 102,
  },
  advanceMethodColumn: {
    flex: 1,
  },
  inlinePanel: {
    gap: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: line,
    backgroundColor: '#fff',
    padding: 12,
  },
  selectorButton: {
    minHeight: 58,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: line,
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flex: 1,
  },
  selectorTextBlock: {
    flex: 1,
  },
  selectorLabel: {
    color: muted,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  selectorValue: {
    color: ink,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 3,
  },
  selectorChevron: {
    color: brick,
    fontSize: 26,
    fontWeight: '900',
  },
  segmented: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: line,
    padding: 4,
    minHeight: 48,
  },
  segment: {
    flex: 1,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  segmentSelected: {
    backgroundColor: ink,
  },
  segmentText: {
    color: ink,
    fontSize: 12,
    fontWeight: '800',
  },
  segmentTextSelected: {
    color: '#fff',
  },
  paymentChoices: {
    flexDirection: 'row',
    gap: 6,
  },
  paymentChoice: {
    flex: 1,
    minHeight: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: line,
    backgroundColor: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  paymentChoiceSelected: {
    borderColor: brick,
    backgroundColor: soft,
  },
  paymentChoiceText: {
    color: ink,
    fontSize: 12,
    fontWeight: '800',
  },
  paymentChoiceTextSelected: {
    color: brick,
  },
  receiptButton: {
    marginTop: 12,
    borderRadius: 8,
    backgroundColor: '#25d366',
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  receiptButtonText: {
    color: '#fff',
    fontWeight: '900',
  },
  receiptCaptureWrap: {
    position: 'absolute',
    left: -10000,
    top: 0,
    width: 380,
  },
  receiptCard: {
    width: 380,
    backgroundColor: '#fffaf6',
    borderRadius: 14,
    padding: 22,
    borderWidth: 1,
    borderColor: '#ead3ce',
  },
  receiptHeader: {
    borderBottomWidth: 2,
    borderBottomColor: brick,
    paddingBottom: 12,
    marginBottom: 14,
  },
  receiptBrand: {
    color: brick,
    fontSize: 24,
    fontWeight: '900',
  },
  receiptTitle: {
    color: ink,
    fontSize: 14,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginTop: 2,
  },
  receiptSection: {
    gap: 4,
  },
  receiptLabel: {
    color: muted,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  receiptCustomer: {
    color: ink,
    fontSize: 20,
    fontWeight: '900',
  },
  receiptMuted: {
    color: muted,
    fontSize: 13,
    fontWeight: '700',
  },
  receiptBirthBox: {
    marginTop: 10,
    borderRadius: 9,
    backgroundColor: '#fffdfb',
    borderWidth: 1,
    borderColor: '#eee4df',
    padding: 9,
  },
  receiptBirthDate: {
    color: muted,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 3,
    textTransform: 'capitalize',
  },
  receiptAgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  receiptAgePill: {
    color: brick,
    fontSize: 12,
    fontWeight: '900',
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ead3ce',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  receiptDivider: {
    height: 1,
    backgroundColor: line,
    marginVertical: 14,
  },
  receiptGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  receiptField: {
    flex: 1,
    minWidth: 150,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: line,
    padding: 10,
  },
  receiptFieldWide: {
    flexBasis: '100%',
  },
  receiptValue: {
    color: ink,
    fontSize: 15,
    fontWeight: '900',
    marginTop: 3,
  },
  receiptPaymentBox: {
    marginTop: 12,
    borderRadius: 10,
    backgroundColor: soft,
    borderWidth: 1,
    borderColor: '#ead3ce',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  receiptAmount: {
    color: green,
    fontSize: 22,
    fontWeight: '900',
    marginTop: 2,
  },
  receiptPaymentMethod: {
    alignItems: 'flex-end',
  },
  receiptPaymentText: {
    color: brick,
    fontSize: 15,
    fontWeight: '900',
    marginTop: 2,
  },
  receiptNotesBox: {
    marginTop: 12,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: line,
    padding: 12,
  },
  receiptNotesText: {
    color: ink,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
    lineHeight: 18,
  },
  receiptFooter: {
    marginTop: 16,
    color: muted,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  helperText: {
    color: muted,
    fontSize: 12,
  },
  saveButton: {
    marginTop: 18,
    alignItems: 'center',
  },
  calendarBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(23, 32, 51, 0.34)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  compactDatePanel: {
    width: '100%',
    maxWidth: 430,
    maxHeight: '88%',
    borderRadius: 12,
    backgroundColor: paper,
    borderWidth: 1,
    borderColor: line,
    overflow: 'hidden',
  },
  compactDateHeader: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  compactDateTitle: {
    color: ink,
    fontSize: 20,
    fontWeight: '900',
  },
  compactCalendarBody: {
    height: 390,
    backgroundColor: '#fff',
  },
  compactDateActions: {
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: line,
  },
  compactCancelButton: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  compactCancelText: {
    color: muted,
    fontWeight: '900',
  },
  compactConfirmButton: {
    borderRadius: 8,
    backgroundColor: brick,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  compactConfirmText: {
    color: '#fff',
    fontWeight: '900',
  },
  calendarPanel: {
    width: '100%',
    maxWidth: 430,
    borderRadius: 12,
    backgroundColor: paper,
    borderWidth: 1,
    borderColor: line,
    padding: 16,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  calendarTitleBlock: {
    alignItems: 'center',
  },
  calendarTitle: {
    color: ink,
    fontSize: 20,
    fontWeight: '900',
    textTransform: 'capitalize',
  },
  calendarNav: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarNavText: {
    color: brick,
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 28,
  },
  calendarWeekdays: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  calendarWeekday: {
    flex: 1,
    textAlign: 'center',
    color: muted,
    fontSize: 11,
    fontWeight: '900',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  calendarDay: {
    width: '13.45%',
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarDayMuted: {
    opacity: 0.45,
  },
  calendarDaySelectedWeek: {
    backgroundColor: soft,
    borderColor: '#ead3ce',
  },
  calendarDaySelected: {
    backgroundColor: brick,
    borderColor: brick,
  },
  calendarDayText: {
    color: ink,
    fontWeight: '900',
  },
  calendarDayTextMuted: {
    color: muted,
  },
  calendarDayTextSelected: {
    color: '#fff',
  },
  calendarDayCount: {
    position: 'absolute',
    bottom: 4,
    color: green,
    fontSize: 10,
    fontWeight: '900',
  },
  pickerPanel: {
    width: '100%',
    maxWidth: 500,
    maxHeight: '82%',
    borderRadius: 12,
    backgroundColor: paper,
    borderWidth: 1,
    borderColor: line,
    padding: 16,
  },
  optionsPanel: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 12,
    backgroundColor: paper,
    borderWidth: 1,
    borderColor: line,
    padding: 16,
  },
  birthdatePanel: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 12,
    backgroundColor: paper,
    borderWidth: 1,
    borderColor: line,
    padding: 16,
  },
  birthdatePreview: {
    color: ink,
    fontSize: 17,
    fontWeight: '900',
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: line,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 12,
    textTransform: 'capitalize',
  },
  datePartsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  datePartColumn: {
    flex: 1,
  },
  datePartTitle: {
    color: muted,
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'center',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  datePartScroll: {
    maxHeight: 250,
  },
  datePartOption: {
    minHeight: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: line,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    paddingHorizontal: 6,
  },
  datePartOptionSelected: {
    backgroundColor: brick,
    borderColor: brick,
  },
  datePartText: {
    color: ink,
    fontWeight: '800',
    textAlign: 'center',
  },
  datePartTextSelected: {
    color: '#fff',
  },
  birthdateConfirm: {
    marginTop: 14,
    alignItems: 'center',
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  pickerTitle: {
    color: ink,
    fontSize: 20,
    fontWeight: '900',
  },
  closePill: {
    borderRadius: 999,
    backgroundColor: soft,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  closePillText: {
    color: brick,
    fontWeight: '900',
  },
  searchInput: {
    minHeight: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: line,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    color: ink,
    marginBottom: 10,
  },
  modalAction: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: brick,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 10,
    backgroundColor: '#fff',
  },
  modalActionText: {
    color: brick,
    fontWeight: '900',
    textAlign: 'center',
  },
  pickerList: {
    maxHeight: 420,
  },
  pickerListContent: {
    gap: 8,
    paddingBottom: 4,
  },
  pickerItem: {
    minHeight: 56,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: line,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  pickerItemSelected: {
    borderColor: brick,
    backgroundColor: soft,
  },
  pickerItemTitle: {
    color: ink,
    fontWeight: '900',
  },
  pickerItemTitleSelected: {
    color: brick,
  },
  pickerItemSubtitle: {
    color: muted,
    marginTop: 2,
    fontSize: 12,
  },
  pickerCheck: {
    color: brick,
    fontSize: 18,
    fontWeight: '900',
  },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionButton: {
    width: '30.9%',
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: line,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  optionButtonSelected: {
    backgroundColor: brick,
    borderColor: brick,
  },
  optionText: {
    color: ink,
    fontWeight: '900',
    textAlign: 'center',
  },
  optionTextSelected: {
    color: '#fff',
  },
});
