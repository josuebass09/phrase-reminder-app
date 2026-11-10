# Phrase Reminder App

The app for [phrase-reminder](https://github.com/josuebass09/phrase-reminder): save English phrases from your phone or computer, see today's reminder, fix or delete phrases, and turn on the daily push notification. It installs on iPhone and Android from the browser and looks native on each.

It's a React app built with Vite. It talks to the backend's API with a bearer token, because the two live on different Railway domains and browsers don't share the backend's cookie between them.

## Run the tests

```bash
npm install
npm test
npm run lint
npm run build
```

The tests run against an in-memory stand-in for the API, so they need no backend.

## Run locally

1. Copy `.env.example` to `.env.local` and set `VITE_API_URL` to a backend, such as `http://localhost:3000` for one running locally.
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

Each device subscribes separately, and only devices that did this get reminders:

- **iPhone or iPad (iOS 16.4 or later):** open the app's URL in Safari, use **Add to Home Screen**, open the app from that icon, then tap **Turn on**. Apple doesn't offer push in a regular Safari tab.
- **Android:** open the URL in Chrome and tap **Turn on**. Add it to the Home Screen for the full-screen app.
- **Computer:** open the URL in your browser and tap **Turn on**.

Moving from the backend's old page to this app means turning reminders on again on each device, because push subscriptions belong to the site that created them.
