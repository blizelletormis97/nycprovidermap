# Feelings Garden

A gentle daily check-in app. Pick how you feel, do a calm activity (breathe with the flower or pop bubbles), and a
flower grows in your garden for each day. Made to be easy for everyone: big buttons, a very readable font, a
"Read to me" button, no timers, no scores and no ways to fail.

## Install it

Open the app's address in your phone's browser:

- **iPhone / iPad:** open it in **Safari**, tap **Share** (the square with an arrow), then **Add to Home Screen**, then
  **Add**. It gets its own flower icon and launch screen and opens full screen.
- **Android (Chrome):** tap **Install app** on the page, or the menu **⋮ → Install app**.
- **Computer (Chrome / Edge):** click the install icon in the address bar.

It then opens full screen from its own icon and works offline.

## Privacy

The garden is saved only on the device (browser storage). Nothing is sent anywhere. Clearing the browser's website
data, or deleting the app, removes the garden.

## How it's built

A single page with no build step:

| File | What it is |
|---|---|
| `index.html` | The whole app (HTML, CSS and JavaScript) |
| `manifest.webmanifest` | App name, colors and icons for installing |
| `sw.js` | Service worker that keeps the app working offline; bump `VERSION` after changing files |
| `icons/` | App icons (pastel flower on mint); `icons/splash/` holds the iPhone launch screens |

It is published at **https://iddproviderfinderny.org/feelings-garden/**: `src/lib/build-site.ts` copies this folder
into the provider map's site, so it goes live with every push to `main` (the map's "Deploy map to GitHub Pages"
workflow).
