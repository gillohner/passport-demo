# Passport demo

A developer demo for [`@pubky/passport-client`](https://github.com/pubky/pubky-passport/tree/main/packages/passport-client):
sign in with [Pubky Passport](https://github.com/pubky/pubky-passport), then use the person's Pubky
homeserver. It is a playground for developers, not an official Pubky app.

Live: https://gillohner.github.io/passport-demo/

Derived from pubky/pubky-app-templates@471735d basic-pubky-app (MIT, see LICENSE).

## What it shows

- **Demo tab**: the playground puts one `<pubky-passport>` on its own stage beside the settings
  that shape it (Passport URL, small or large style with the Pubky Ring QR, profile required or
  optional) and the matching snippet. **Styles** below shows more looks, each live with its code:
  your own button and a text link on the headless client (`createPassportClient`, `subscribe()`,
  `signIn()`), the simple tag, the large style, your own words (`messages`), your own colours and
  size (CSS custom properties), and a combination. A small button also sits in the header.
- **Use it in your app tab**: the one snippet an app starts from, with links to the integration
  guide, the package README and `src/passport.ts`.
- **Signed in**: the person's name from their pubky.app profile, their public key, and a files panel
  that writes to `/pub/passport-demo/files/` on their homeserver with the SDK Session. A reload
  keeps them signed in; Sign out revokes the Session.

## Where the integration is

What an app copies is [`src/passport.ts`](src/passport.ts): the element's `passport-session`
listener, keeping the Session with the SDK's session store, restoring it on load, and signing out.
The playground's own machinery is elsewhere: its settings and the element's attributes
(`src/settings.ts`, `src/config.ts`), and taking one Session when several buttons share a page
(`firstSignIn` in `src/settings.ts`). The rest is page UI (`src/app.ts`, `src/styles.ts` for the
gallery, `src/explainer.ts`, `src/dom.ts`, `src/style.css`) and the files panel (`src/files.ts`,
`src/storage.ts`).

## Run it

Node 24 (see `.nvmrc`):

```bash
npm ci
npm run dev        # http://localhost:5173
npm run typecheck && npx vitest run
```

`VITE_PASSPORT_URL` picks the Passport to sign in with (default: the package's own,
`https://passport.pubky.app`). Behind a port forward, list its host names in `DEMO_ALLOWED_HOSTS`
(comma-separated, `.example.com` for subdomains).

## The package

`@pubky/passport-client` isn't on npm yet, so `vendor/` holds a packed build of version 0.1.0 from
the pubky-passport repository (`npm pack` of `packages/passport-client`), and `docs/integration.md`
is a copy of that repository's integration guide. Once the package is published, replace the
`file:vendor/...` dependency with `"@pubky/passport-client": "^0.1.0"`.

## Deploy

Every push to `main` builds and deploys to GitHub Pages (`.github/workflows/pages.yml`). The
repository variable `PASSPORT_URL` sets the Passport the published page uses.
