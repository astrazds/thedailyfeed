export function registerWorker(): void {
  if (__DEV__ || !('serviceWorker' in navigator)) return;
  void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
    .catch((error: unknown) => console.error('Offline support could not start.', error));
}
