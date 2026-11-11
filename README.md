# Phrase Reminder App

The app for [phrase-reminder](https://github.com/josuebass09/phrase-reminder): save English phrases from your phone or computer, practice the ones the daily reminder brings back, and hear, translate, say aloud, fix or delete any of them. It installs on iPhone and Android from the browser.

It's a React app built with Vite. It talks to the backend's API with a bearer token, because the two live on different Railway domains and browsers don't share cookies between them.

## How it's laid out

Three tabs at the bottom, and a fourth for the admin:

- **Today:** the latest reminder's phrases, to hear and say aloud, and to swipe off once gone over: right for **Remembered**, left for **Read**. The card follows the finger and tilts, a green stamp says which as it goes, and past 30% of its width (or with a quick flick) it flies off; short of that it springs back, and up and down still scroll. A note offers **Undo** for 5 seconds. The backend keeps it off Today, on every device, until a later reminder sends it again, and records which answer it was. A Today phrase's sheet has the same two buttons, for anyone who can't or won't swipe. Once all are done, Today says so, with the next reminder's time. With none yet, it says when the next one comes, or how to turn reminders on, and offers to add a phrase. The bell at the top shows the reminder's time, or **Paused**; it opens Settings, or turns reminders on for a device that doesn't have them.
- **Phrases:** every phrase, newest first, 50 at a time with **Load more**, and a search over their English and Spanish.
- **Settings:** the daily reminder, today's usage, the theme and the language, and the account. **Today's usage** has a row for each daily limit: what spends it, a bar of how much is used, and how many are left. The bar turns amber when a few are left (the last fifth, at most 5) and red when none are, and the heading counts down to midnight, when they all start over. The admin has no limits, so their Settings leaves it out.
- **Admin** (the admin only): what helps look after the app as it grows, loaded again each time the tab opens.
  - **AI quotas:** a card for each service whose free plan the whole account shares (Groq's chat and speech models, and MyMemory): today's requests and what they used, a meter of today's share of the daily quota (what Groq last said is left, or MyMemory's documented characters), and the worst case with every user at their limits, with how many users would fit. A status says each state in words with an icon, never by color alone, as amber and red read alike to many. Below, columns for the last 30 UTC days, today in the accent; hovering, tapping, or the arrow keys give a day's value, and **Show by day** lists them all.
  - **Users:** inviting someone, and each user's sign-up date, last activity, phrases, devices with reminders, sessions, and today's usage, flagging anyone inactive for over 2 weeks. **Log out everywhere** ends a user's sessions on every device after a second tap, keeping their data.
  - **System:** when the reminder cron last ran (a warning after 45 minutes, 3 missed runs), its runs and errors in the last day and its last error, reminders delivered on each of the last 7 days, the database's size and its biggest tables, and the commit the app, the API, and the cron run, with a warning when the API and the cron, which deploy from the same repository, run different ones. The app's commit comes from its own server's `/version.json` (`server.mjs`), which reads Railway's `RAILWAY_GIT_COMMIT_SHA` at run time; Railway doesn't give it to the build.

The **+** button on Today and Phrases adds a phrase. Each phrase shows on a card: the English, its Spanish once known, a play button, its last score and when it was saved. Today's cards also have the microphone. A tap anywhere else on a card opens the phrase's sheet, with everything for it. Each tab keeps its place when you switch, and tapping the tab you're on scrolls it back to the top.

Tapping the daily notification opens the app on Today. If the app was already open, it switches to Today and loads the phrases just sent. A sheet that's open stays, in case it holds something unsaved.

## Accounts

Each person logs in with an email and password and sees only their own phrases.

New people join with an invite link from the admin, who is the first user. In Settings, the admin taps **Invite someone**, then **Share** or **Copy**. Each link creates one account and expires after 7 days. Opening it shows the sign-up form with the code filled in; the person picks an email and a password of at least 12 characters. The code also works typed or pasted after tapping **I have an invite** on the login screen. The app removes the code from the address as soon as it opens, so it doesn't stay in the browser history or become the installed app's start page.

A login stays open while the app is used: the app renews its tokens on its own, and only 60 days without opening it, or logging out, show the login screen again, with the last email already filled in. Renewing needs a connection, so being offline never logs anyone out. Settings shows who is logged in, and has **Log out** for this device and **Log out of all devices**, such as for a lost phone. A login from before long sessions still ends after its 12 hours.

## The daily reminder

Under **Daily reminder** in Settings, each person turns their reminder on or off, picks its time with the phone's own time picker, and chooses 1 to 5 phrases. Changes save right away, and the backend sends the reminder within 15 minutes of that time, in the time zone of the person's phone. The same section shows whether this device gets reminders, with **Turn on** if not.

## Add a phrase

The **+** button opens a sheet. Type what you want to say, in Spanish or English, and optionally a **Context**, such as "Slack message to my manager about a late deploy". **Translate** shows a formal way to say it in English (for work) and an informal one (for friends), each with 1x and 0.5x buttons to hear it. Save the one you like, and the app shows it first in Phrases.

**Save it as I wrote it** saves the text as typed, before or instead of asking the AI, such as for a phrase already in English, when the AI is down, or when today's suggestions are used up. Each user may get 20 suggestions a day (the admin has no limit), and Settings shows how many they've used. The backend asks a free AI on Groq; see the backend's README.

## A phrase's sheet

Tapping a phrase opens it larger in a sheet, with when it was saved and its last score, and three buttons: **Listen**, **Slower** at half speed to hear each sound, and **Say it** for a score. The pencil at the top right turns the sheet into the editor, to fix or delete the phrase; Cancel goes back to reading.

**Show in Spanish** asks the backend for the phrase's Spanish the first time. The backend translates each phrase once and keeps it, so after that it shows on the phrase's card and sheet without asking; editing the phrase drops it, and the new text is translated the next time. Each user may ask for 30 new translations a day (the admin has no limit). Past the limit, the app says so and the count starts over at the user's midnight.

## Listen to a phrase

The play button on a card, and Listen and Slower in its sheet, read the phrase aloud in English. The one playing fills in; tap it again to stop, or tap another to switch. Only one phrase plays at a time.

It uses the device's own voices through the browser's Web Speech API, so it costs nothing, needs no server, and works offline. The app picks the best English voice it finds, preferring American English and "Enhanced" or "Premium" voices, and skips Apple's novelty voices. To get a better voice, download one in the phone's settings:

- **iPhone:** Settings → Accessibility → Spoken Content → Voices → English, then download an Enhanced or Premium voice.
- **Android:** Settings → Text-to-speech output, with Speech Services by Google, then install the English voice data.

Browsers without speech synthesis show no play buttons.

## Say a phrase and get a score

The microphone on Today's cards, and **Say it** in a phrase's sheet, record you saying the phrase: tap it, say the phrase, and tap it again. It also stops on its own after 10 seconds. While it records it turns red, and nothing is read aloud, so the microphone only hears you. A red waveform follows your voice as you speak, rising while you talk and lying flat while you're quiet, and goes away when the recording stops. It takes the place of the score and date on a card, and sits under the buttons in the sheet.

On iOS 27, reading a phrase aloud leaves the page's microphone silent until the page reloads ([WebKit bug 218815](https://bugs.webkit.org/show_bug.cgi?id=218815)). The app notices a muted microphone, before you speak or when you stop, and asks you to reload instead of sending a recording with no sound; if one gets through, the backend says the same. The backend scores it from 1 to 10, and the result shows under the phrase:

- **1 to 6**, red, with a shake: poor pronunciation
- **7**, amber, with a nudge: almost there
- **8 or 9**, green, with a pop: good pronunciation
- **10**, purple, with a pop and a glow: perfect pronunciation

The words it didn't hear are underlined, with a tip on the sounds to fix and **Hear it at 0.5x**. The X closes it. The last score stays on the phrase's card and sheet, and editing the phrase drops it. The number always shows with its color, and with reduced motion on, nothing moves.

The first time, the phone asks to use the microphone. The recording goes to the backend and on to Groq to be heard, and isn't kept. Each user may get 20 scores a day (the admin has no limit), and Settings shows how many they've used. Browsers that can't record show no microphone. The backend's README explains the score: it says how clearly the phrase came through more than how native it sounded.

## Language

The app speaks English or Spanish. It starts in the device's language, and **Language** under Appearance in Settings switches it. The choice is saved on the device, so the login screen uses it too, and in the account, so every device and the daily reminder's notification follow it. The backend's messages, such as today's limit, come in the same language.

## Activity

To tell whether the reminders help, the app tells the backend what each person does: opening the app from the notification, looking at Today, and hearing or translating a phrase. The backend adds the reminders it sent and the phrases said aloud. Each counts once a day, or once a day per phrase; the app sends nothing else, never waits for it, and drops it if it fails. The admin sees each person's weeks with the backend's `npm run users -- stats`.

The service worker opens the app at `/?from=reminder` when the notification is tapped and the app isn't open yet; the app removes the mark from the address as it opens.

## Design

One design for iPhone, Android and computers: large page titles, cards for phrases, sheets that rise from the bottom on a phone and sit centered on a wider screen, a tab bar, and a + button above it. Touch targets are at least 38 pixels, and every wait shows the same turning ring: logging in, the first load, saving, editing and deleting, translating, getting options, scoring, turning on reminders, and creating an invite.

The colors are "Azul noche": cobalt on blue-tinted greys, with a matching dark mode, keeping text readable (WCAG AA contrast). They're the variables at the top of `src/styles.css`. **Theme** under Appearance in Settings picks Auto, which follows the device, Light, or Dark; the choice is kept on that device. `src/theme.ts` applies it and colors the phone's status bar to match. The app icon, `public/icon.svg` and its PNGs, uses the same cobalt.

The icons come from [Lucide](https://lucide.dev) (ISC; some started in Feather, MIT), which allow free use as long as the notice is kept. The notice is in `THIRD_PARTY_NOTICES.md` and in `src/icons.tsx`, and `vite.config.ts` keeps it in the built files. The spinner is drawn in this app's own CSS.

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

Each device subscribes separately and gets the reminders of whoever is logged in on it. Only devices that did this get reminders, and they keep getting them after the person logs out:

- **iPhone or iPad (iOS 16.4 or later):** open the app's URL in Safari, use **Add to Home Screen**, open the app from that icon, then tap **Turn on**. Apple doesn't offer push in a regular Safari tab.
- **Android:** open the URL in Chrome and tap **Turn on**. Add it to the Home Screen for the full-screen app.
- **Computer:** open the URL in your browser and tap **Turn on**.

Moving from the backend's old page to this app means turning reminders on again on each device, because push subscriptions belong to the site that created them. If someone else logs in on a device later, its reminders move to them.
