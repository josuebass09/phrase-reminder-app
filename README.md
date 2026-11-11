# Phrase Reminder App

The app for [phrase-reminder](https://github.com/josuebass09/phrase-reminder): translate and save English phrases from your phone or computer, see today's reminder, read, fix or delete phrases, and turn on the daily push notification. It installs on iPhone and Android from the browser and looks native on each.

It's a React app built with Vite. It talks to the backend's API with a bearer token, because the two live on different Railway domains and browsers don't share cookies between them.

## Accounts

Each person logs in with an email and password and sees only their own phrases.

New people join with an invite link from the admin, who is the first user. In Settings (the person icon), the admin taps **Invite someone**, then **Share** or **Copy**. Each link creates one account and expires after 7 days. Opening it shows the sign-up form with the code filled in; the person picks an email and a password of at least 12 characters. The code also works typed or pasted after tapping **I have an invite** on the login screen. The app removes the code from the address as soon as it opens, so it doesn't stay in the browser history or become the installed app's start page.

A login lasts 12 hours. After that, the app shows the login screen again with the last email already filled in. The person icon at the top opens Settings, which shows who is logged in and until when, and has **Log out**.

## Settings

The person icon at the top opens Settings. Under **Daily reminder**, each person turns their reminder on or off, picks its time with the phone's own time picker, and chooses 1 to 5 phrases. Changes save right away, and the backend sends the reminder within 15 minutes of that time, in the time zone of the person's phone. The same sheet shows whether this device gets reminders, with **Turn on** if not, and holds the account: email, invites for the admin, and **Log out**.

The bell button at the top shows the reminder's time, or **Paused**, once the device has reminders on; tapping it opens Settings.

Tapping the daily notification opens the app on Today. If the app was already open, it closes Settings, loads the phrases just sent, and scrolls up to Today. A phrase open to read or edit stays open, in case it holds an unsaved fix.

## Listen to a phrase

Under each phrase, two buttons read it aloud in English, labeled with their speed like a video player's: **1x** at normal speed and **0.5x** at half speed, to hear each sound. The one playing fills in; tap it again to stop, or tap the other to switch speeds. Only one phrase plays at a time.

It uses the device's own voices through the browser's Web Speech API, so it costs nothing, needs no server, and works offline. The app picks the best English voice it finds, preferring American English and "Enhanced" or "Premium" voices, and skips Apple's novelty voices. To get a better voice, download one in the phone's settings:

- **iPhone:** Settings → Accessibility → Spoken Content → Voices → English, then download an Enhanced or Premium voice.
- **Android:** Settings → Text-to-speech output, with Speech Services by Google, then install the English voice data.

Browsers without speech synthesis show no speed buttons.

## Translate a phrase

The 文A button next to the speed buttons shows the phrase in Spanish, in a speech bubble above the original. Close it with the X in the bubble's top-right corner, or by tapping 文A again. The backend translates each phrase once and keeps it, so reopening it is instant; editing the phrase translates the new text the next time.

Each user may ask for 30 new translations a day (the admin has no limit); reopening a saved one doesn't count. Past the limit, the app says so and the count starts over at the user's midnight. Settings shows how many they've used today.

## Translate a new phrase

Type it under **Translate phrase**, in Spanish or English, and optionally a **Context** underneath, such as "Slack message to my manager about a late deploy". **Translate** shows a formal way to say it in English (for work) and an informal one (for friends), above Today and Recent, in English only, each with the 1x and 0.5x buttons. Save the one you like and it goes to the top of Recent, where 文A translates it like any other phrase; both boxes then clear for the next phrase.

"Save it as I wrote it" saves the text as typed, such as when the AI is down or today's suggestions are used up. Each user may get 20 a day (the admin has no limit), and Settings shows how many they've used. The backend asks a free AI on Groq; see the backend's README.

## Read a phrase

Tapping a phrase opens it in a sheet to read: larger, with when it was saved, the 1x and 0.5x buttons, and 文A for its Spanish. The pencil at the top right turns the sheet into the editor, to fix or delete the phrase; Cancel goes back to reading.

## Language

The app speaks English or Spanish. It starts in the device's language, and **Language** under Account in Settings switches it. The choice is saved on the device, so the login screen uses it too, and in the account, so every device and the daily reminder's notification follow it. The backend's messages, such as today's limit, come in the same language.

## Design

The app follows the platform it runs on, set from the browser's user agent before the first render: iOS conventions on iPhone and iPad (large title, grouped lists, sheets, buttons that dim when pressed, the spoked activity indicator), and Material 3 on Android (top app bar, outlined fields and chips, a floating Save button, snackbars, pressed-state layers, the circular progress indicator). Every wait shows a spinner in that platform's style: logging in, the first load, saving, editing and deleting, translating, getting options, turning on reminders, and creating an invite.

The colors are "Salvia y papel": muted sage on warm paper, with a matching dark mode, chosen to be easy on the eyes while keeping text readable (WCAG AA contrast). They're the variables at the top of `src/styles.css`.

The moon (or sun) button at the top switches between light and dark, on the login screen too. Until it's used, the app follows the device's setting; after that, the choice is kept on that device. `src/theme.ts` applies it and colors the phone's status bar to match.

The icons come from [Lucide](https://lucide.dev) (ISC; some started in Feather, MIT), which allow free use as long as the notice is kept. The notice is in `THIRD_PARTY_NOTICES.md` and in `src/icons.tsx`, and `vite.config.ts` keeps it in the built files. The spinners are drawn in this app's own CSS.

## Run the tests

```bash
npm install
npm test
npm run lint
npm run build
```

The tests run against an in-memory stand-in for the API, so they need no backend.

## Run locally

1. Copy `.env.example` to `.env.local` and set `VITE_API_URL` to a backend, such as `http://localhost:3000` for one running locally, with at least one user.
2. Add this app's local address to the backend's `APP_ORIGIN`, such as `http://localhost:5173`. Several addresses go comma-separated.
3. Run `npm run dev` and open http://localhost:5173.

## Deploy to Railway

Railway deploys from this repository. `railway.json` sets the build and start commands.

1. In the backend's Railway project, add a service from this repository.
2. Set the variable `VITE_API_URL` to the backend's URL, such as `https://phrase-reminder-production.up.railway.app`, with no trailing slash. Vite reads it during the build, and `server.mjs` reads it at run time to allow requests to the backend.
3. Generate a public domain under Networking.
4. On the backend service, set `APP_ORIGIN` to this app's domain, such as `https://phrase-reminder-app-production.up.railway.app`, and redeploy it. Without that, the browser blocks the app's requests.

`server.mjs` serves the built files with a Content Security Policy that only allows requests to this app and the backend. Files under `/assets` are cached for a year, since their names change with every build. Everything else, including the service worker, is checked on each load, so devices pick up new versions.

## Turn on reminders on each device

Each device subscribes separately and gets the reminders of whoever is logged in on it. Only devices that did this get reminders, and they keep getting them after the 12-hour login ends:

- **iPhone or iPad (iOS 16.4 or later):** open the app's URL in Safari, use **Add to Home Screen**, open the app from that icon, then tap **Turn on**. Apple doesn't offer push in a regular Safari tab.
- **Android:** open the URL in Chrome and tap **Turn on**. Add it to the Home Screen for the full-screen app.
- **Computer:** open the URL in your browser and tap **Turn on**.

Moving from the backend's old page to this app means turning reminders on again on each device, because push subscriptions belong to the site that created them. If someone else logs in on a device later, its reminders move to them.
