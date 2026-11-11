import { useSyncExternalStore } from 'react'
import { getLanguage, subscribeLanguage, type Language } from './language.ts'

const en = {
  appName: 'Phrases',
  darkMode: 'Dark mode',
  settings: 'Settings',
  sessionEnded: 'Your session ended. Log in again.',

  // Login
  wrongLogin: 'Wrong email or password.',
  cantReachServer: "Couldn't reach the server. Try again.",
  createAccount: 'Create account',
  invited: "You were invited. Choose the email and password you'll log in with.",
  email: 'Email',
  password: 'Password',
  passwordHint: (min: number) => `At least ${min} characters.`,
  inviteCode: 'Invite code',
  creatingAccount: 'Creating account…',
  loggingIn: 'Logging in…',
  logIn: 'Log in',
  haveAccount: 'I already have an account',
  haveInvite: 'I have an invite',

  // The new phrase, and its options
  translatePhrase: 'Translate phrase',
  phrasePlaceholder: 'Type it in Spanish or English',
  context: 'Context',
  contextPlaceholder: "Optional: who it's for, or where",
  translate: 'Translate',
  translating: 'Translating…',
  waysToSayIt: 'Ways to say it',
  closeOptions: 'Close options',
  findingWays: 'Finding the best ways to say it…',
  tryAgain: 'Try again',
  saveAsWritten: 'Save it as I wrote it',
  formal: 'Formal',
  informal: 'Informal',
  formalHint: "For work and people you don't know",
  informalHint: 'For friends and close teammates',
  save: 'Save',
  saving: 'Saving…',
  saved: 'Saved',
  saveOption: (style: string) => `Save ${style.toLowerCase()}`,
  optionSaved: (style: string) => `${style} saved`,
  couldntGetOptions: "Couldn't get options. Check your connection.",

  // Lists and phrases
  today: 'Today',
  recent: 'Recent',
  loadingPhrases: 'Loading your phrases…',
  noPhrases: 'Your saved phrases will appear here.',
  listen: 'Listen at 1x',
  listenSlowly: 'Listen at 0.5x',
  translateToSpanish: 'Translate to Spanish',
  closeTranslation: 'Close translation',
  openPhrase: 'Open phrase',
  savedToday: 'Saved today',
  savedYesterday: 'Saved yesterday',
  savedOn: (date: string) => `Saved ${date}`,

  // Toasts
  phraseSaved: 'Phrase saved',
  phraseUpdated: 'Phrase updated',
  phraseDeleted: 'Phrase deleted',
  alreadyDeleted: 'That phrase was already deleted.',
  couldntLoad: "Couldn't load your phrases.",
  couldntSave: "Couldn't save. Try again.",
  couldntTranslate: "Couldn't translate. Try again.",

  // Reminders
  turnOn: 'Turn on',
  paused: 'Paused',
  turningOnReminder: 'Turning on daily reminder',
  turnOnReminder: 'Turn on daily reminder',
  reminderPaused: 'Daily reminder paused. Open settings',
  reminderAt: (time: string) => `Daily reminder at ${time}. Open settings`,
  addToHomeScreen: 'Add this app to your Home Screen to turn on reminders.',
  couldntTurnOn: "Couldn't turn on reminders. Try again.",
  notificationsBlocked: 'Notifications are blocked. Allow them in your settings.',
  remindersOn: 'Reminders on',

  // The phrase sheet
  phrase: 'Phrase',
  close: 'Close',
  editPhrase: 'Edit phrase',
  cancel: 'Cancel',
  savingNow: 'Saving',
  deletePhrase: 'Delete phrase',
  tapAgainToDelete: 'Tap again to delete',
  deleting: 'Deleting…',
  couldntSaveKept: "Couldn't save. Your text is still here.",
  couldntDelete: "Couldn't delete. Try again.",

  // Settings
  done: 'Done',
  account: 'Account',
  loggedInUntil: (time: string) => `Logged in until ${time}`,
  logOut: 'Log out',
  language: 'Language',
  dailyReminder: 'Daily reminder',
  savedSetting: 'Saved',
  loadingSettings: 'Loading your settings…',
  sendMePhrases: 'Send me phrases',
  time: 'Time',
  phrasesEachTime: 'Phrases each time',
  thisDevice: 'This device',
  on: 'On',
  addToHomeScreenFirst: 'Add to Home Screen first',
  reminderNote: (time: string, zone: string, count: number) =>
    `Every day around ${time}, ${zone} time, with ${count} ${count === 1 ? 'phrase' : 'phrases'} saved at least 14 days ago.`,
  reminderPausedNote: 'Paused. No reminders go out until you turn this back on.',
  usageTranslate: 'Translate',
  usageSpanish: 'Spanish of a phrase (文A)',
  usedOf: (used: number, limit: number) => `${used} of ${limit}`,
  usedNoLimit: (used: number) => `${used} · no limit`,
  usageNote:
    "Both start over at midnight. Phrases you've already seen in Spanish show it again for free.",

  // Invites
  inviteSomeone: 'Invite someone',
  creatingLink: 'Creating link…',
  inviteLink: 'Invite link',
  inviteExpires: (date: string) => `Creates one account. Expires on ${date}.`,
  share: 'Share',
  shareText: 'Join me on Phrases to remember English phrases.',
  copy: 'Copy',
  copied: 'Copied',
  couldntCreateInvite: "Couldn't create an invite. Try again.",
  couldntCopy: "Couldn't copy. The link is selected, so copy it from there.",
}

export type Messages = typeof en

const es: Messages = {
  appName: 'Frases',
  darkMode: 'Modo oscuro',
  settings: 'Ajustes',
  sessionEnded: 'Tu sesión terminó. Vuelve a iniciar sesión.',

  wrongLogin: 'Correo o contraseña incorrectos.',
  cantReachServer: 'No se pudo conectar con el servidor. Inténtalo de nuevo.',
  createAccount: 'Crear cuenta',
  invited: 'Te invitaron. Elige el correo y la contraseña con los que vas a entrar.',
  email: 'Correo',
  password: 'Contraseña',
  passwordHint: (min) => `Al menos ${min} caracteres.`,
  inviteCode: 'Código de invitación',
  creatingAccount: 'Creando cuenta…',
  loggingIn: 'Entrando…',
  logIn: 'Entrar',
  haveAccount: 'Ya tengo una cuenta',
  haveInvite: 'Tengo una invitación',

  translatePhrase: 'Traducir frase',
  phrasePlaceholder: 'Escríbela en español o en inglés',
  context: 'Contexto',
  contextPlaceholder: 'Opcional: para quién es o dónde',
  translate: 'Traducir',
  translating: 'Traduciendo…',
  waysToSayIt: 'Formas de decirlo',
  closeOptions: 'Cerrar opciones',
  findingWays: 'Buscando las mejores formas de decirlo…',
  tryAgain: 'Intentar de nuevo',
  saveAsWritten: 'Guardarla como la escribí',
  formal: 'Formal',
  informal: 'Informal',
  formalHint: 'Para el trabajo y gente que no conoces',
  informalHint: 'Para amigos y compañeros cercanos',
  save: 'Guardar',
  saving: 'Guardando…',
  saved: 'Guardada',
  saveOption: (style) => `Guardar ${style.toLowerCase()}`,
  optionSaved: (style) => `${style} guardada`,
  couldntGetOptions: 'No se pudieron obtener opciones. Revisa tu conexión.',

  today: 'Hoy',
  recent: 'Recientes',
  loadingPhrases: 'Cargando tus frases…',
  noPhrases: 'Aquí van a aparecer tus frases guardadas.',
  listen: 'Escuchar a 1x',
  listenSlowly: 'Escuchar a 0.5x',
  translateToSpanish: 'Traducir al español',
  closeTranslation: 'Cerrar traducción',
  openPhrase: 'Abrir frase',
  savedToday: 'Guardada hoy',
  savedYesterday: 'Guardada ayer',
  savedOn: (date) => `Guardada el ${date}`,

  phraseSaved: 'Frase guardada',
  phraseUpdated: 'Frase actualizada',
  phraseDeleted: 'Frase eliminada',
  alreadyDeleted: 'Esa frase ya se había eliminado.',
  couldntLoad: 'No se pudieron cargar tus frases.',
  couldntSave: 'No se pudo guardar. Inténtalo de nuevo.',
  couldntTranslate: 'No se pudo traducir. Inténtalo de nuevo.',

  turnOn: 'Activar',
  paused: 'En pausa',
  turningOnReminder: 'Activando el recordatorio diario',
  turnOnReminder: 'Activar el recordatorio diario',
  reminderPaused: 'Recordatorio diario en pausa. Abrir ajustes',
  reminderAt: (time) => `Recordatorio diario a las ${time}. Abrir ajustes`,
  addToHomeScreen: 'Agrega esta app a tu pantalla de inicio para activar los recordatorios.',
  couldntTurnOn: 'No se pudieron activar los recordatorios. Inténtalo de nuevo.',
  notificationsBlocked: 'Las notificaciones están bloqueadas. Permítelas en los ajustes.',
  remindersOn: 'Recordatorios activados',

  phrase: 'Frase',
  close: 'Cerrar',
  editPhrase: 'Editar frase',
  cancel: 'Cancelar',
  savingNow: 'Guardando',
  deletePhrase: 'Eliminar frase',
  tapAgainToDelete: 'Toca otra vez para eliminar',
  deleting: 'Eliminando…',
  couldntSaveKept: 'No se pudo guardar. Tu texto sigue aquí.',
  couldntDelete: 'No se pudo eliminar. Inténtalo de nuevo.',

  done: 'Listo',
  account: 'Cuenta',
  loggedInUntil: (time) => `Sesión activa hasta las ${time}`,
  logOut: 'Cerrar sesión',
  language: 'Idioma',
  dailyReminder: 'Recordatorio diario',
  savedSetting: 'Guardado',
  loadingSettings: 'Cargando tus ajustes…',
  sendMePhrases: 'Enviarme frases',
  time: 'Hora',
  phrasesEachTime: 'Frases cada vez',
  thisDevice: 'Este dispositivo',
  on: 'Activado',
  addToHomeScreenFirst: 'Primero agrégala a la pantalla de inicio',
  reminderNote: (time, zone, count) =>
    `Todos los días cerca de las ${time}, hora de ${zone}, con ${count} ${count === 1 ? 'frase guardada' : 'frases guardadas'} hace al menos 14 días.`,
  reminderPausedNote: 'En pausa. No se envían recordatorios hasta que lo vuelvas a activar.',
  usageTranslate: 'Traducir',
  usageSpanish: 'Español de una frase (文A)',
  usedOf: (used, limit) => `${used} de ${limit}`,
  usedNoLimit: (used) => `${used} · sin límite`,
  usageNote:
    'Ambos se reinician a medianoche. Las frases que ya viste en español lo vuelven a mostrar gratis.',

  inviteSomeone: 'Invitar a alguien',
  creatingLink: 'Creando enlace…',
  inviteLink: 'Enlace de invitación',
  inviteExpires: (date) => `Sirve para crear una cuenta. Vence el ${date}.`,
  share: 'Compartir',
  shareText: 'Únete a Phrases para recordar frases en inglés.',
  copy: 'Copiar',
  copied: 'Copiado',
  couldntCreateInvite: 'No se pudo crear la invitación. Inténtalo de nuevo.',
  couldntCopy: 'No se pudo copiar. El enlace está seleccionado; cópialo desde ahí.',
}

const MESSAGES: Record<Language, Messages> = { en, es }

export function messagesFor(language: Language): Messages {
  return MESSAGES[language]
}

/** The locale for dates, such as "Mar 4" or "4 mar". */
export function dateLocale(language: Language): string {
  return language === 'es' ? 'es' : 'en-US'
}

/** The app's words in its current language. Components using it change with the language. */
export function useT(): Messages {
  return MESSAGES[useSyncExternalStore(subscribeLanguage, getLanguage)]
}

/** The current language, for components that need it beyond the words, such as for dates. */
export function useLanguage(): Language {
  return useSyncExternalStore(subscribeLanguage, getLanguage)
}
