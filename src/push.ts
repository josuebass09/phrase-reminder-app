// iOS only exposes push to web apps opened from the Home Screen.
export const pushSupported =
  typeof navigator !== 'undefined' &&
  'serviceWorker' in navigator &&
  typeof window !== 'undefined' &&
  'PushManager' in window &&
  'Notification' in window

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
}

/** Registers the service worker and returns this device's subscription, if any. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  await navigator.serviceWorker.register('/sw.js')
  const registration = await navigator.serviceWorker.ready
  return registration.pushManager.getSubscription()
}

/**
 * Asks for permission and subscribes. iOS only shows the prompt when it comes
 * directly from a tap, so call this before awaiting anything else in the handler.
 */
export async function subscribe(vapidPublicKey: string): Promise<PushSubscription | 'denied'> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'denied'
  const registration = await navigator.serviceWorker.ready
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToBytes(vapidPublicKey),
  })
}
