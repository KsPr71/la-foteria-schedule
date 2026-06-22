const openReservationListeners = new Set<() => void>();

export function requestNewReservation() {
  openReservationListeners.forEach((listener) => listener());
}

export function subscribeNewReservation(listener: () => void) {
  openReservationListeners.add(listener);
  return () => {
    openReservationListeners.delete(listener);
  };
}
