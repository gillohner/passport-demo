# @pubky/passport-client

One "Continue with Pubky" button that signs people in with their Pubky identity through Pubky
Passport. It opens Passport in a pop-up (continuing in the same tab when the browser blocks it),
shows a Pubky Ring QR code and link in the large style, and by default makes sure the person has a
pubky.app profile. Your app receives a real SDK `Session`, the public key and the validated
profile; a pop-up message is only a UI signal, and only an SDK `Session` authenticates.

Status: a private workspace package, not published to npm yet. It stays unpublished until the npm
scope is confirmed and `passport.pubky.app` serves `/authorize` with opener protocol v2; a release
also needs the maintainer's explicit go-ahead. The default instance is `https://passport.pubky.app`.
It has no runtime dependencies of its own; the app supplies two peers: `@synonymdev/pubky` (0.11 or
0.12) and `pubky-app-specs` (0.7, loaded only after a sign-in, to validate the profile).

## The element

```html
<pubky-passport
  instance="https://passport.pubky.app"
  app-name="Example App"
  client-id="example.app"
  capabilities="/pub/example.app/:rw"
></pubky-passport>
<script type="module">
  import "@pubky/passport-client/element";
  const button = document.querySelector("pubky-passport");
  button.addEventListener("passport-session", (event) => {
    const { session, publicKey, profile } = event.detail; // the Session is yours to keep
  });
  // After your sign-out (await session.signout()), show the button again:
  // button.reset();
</script>
```

| Attribute      | Default                      | Meaning                                                                    |
| -------------- | ---------------------------- | -------------------------------------------------------------------------- |
| `instance`     | `https://passport.pubky.app` | The Passport people sign in with (people can pick their own)               |
| `app-name`     | the page's host name         | Shown in Passport                                                          |
| `client-id`    | the page's host name         | A stable ID for the app, part of the request                               |
| `capabilities` | `""` (identity only)         | e.g. `/pub/example.app/:rw`; `/`, `/pub`, `/pub/` and `/priv…` are refused |
| `profile`      | `required`                   | `optional` signs in people without a pubky.app profile                     |
| `variant`      | `small`                      | `large` adds the Pubky Ring QR code and link                               |
| `messages`     | English                      | JSON of replacement texts, e.g. `{"label.idle": "Weiter mit Pubky"}`       |

`messages` is also a property that takes the same object (and replaces the attribute). Every
attribute is optional. Changing a configuration attribute starts over with the new settings.
It looks like Passport: a dark pill in Passport's main button style (white border and text) with
the Pubky mark; the large style is a dark card with the Pubky Ring QR code (the Pubky mark in its
centre, Q error correction) and, at phone size or on a touch screen, an "Open in Pubky Ring" link.
The element never takes more room than its button (or card). While a sign-in runs, the label says
what is happening (also as hover text and to screen readers) and a cross in the button cancels it.
The settings, and errors with their reason and next step, open in a popover below the button, over
the page (the browser's top layer where available), which Escape or a click outside closes. The
settings are one address field, checked as it is typed and used on Enter or with its check mark. The settings control on the right of the pill lets people sign in
with their own Passport (their choice is kept for this app's origin); it shows only while no
sign-in runs. Optional CSS custom properties on the
element: `--passport-brand`, `--passport-ink` (the dark surface), `--passport-font`,
`--passport-height` and `--passport-qr-size`. Signed in, the element renders nothing until
`reset()`. Its one event, `passport-session`
(bubbling, composed), carries `{ session, publicKey, profile }`. The element finishes a same-tab
return by itself.

In React or Next.js, render the tag and listen with a ref (import the element module on the client
only, for example in an effect or a `"use client"` component):

```tsx
"use client";
import type { SignedIn } from "@pubky/passport-client";
import { useEffect, useRef } from "react";

export function PassportButton({ onSignedIn }: { onSignedIn: (detail: SignedIn) => void }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    void import("@pubky/passport-client/element");
    const element = ref.current;
    const listener = (event: Event) => onSignedIn((event as CustomEvent<SignedIn>).detail);
    element?.addEventListener("passport-session", listener);
    return () => element?.removeEventListener("passport-session", listener);
  }, [onSignedIn]);
  return <pubky-passport ref={ref} instance="https://passport.pubky.app" app-name="Example" />;
}
```

TypeScript needs a JSX declaration for the `pubky-passport` tag in your app. The package ships no
React wrapper; the tag is the component.

## Headless: your own button

```ts
import { createPassportClient } from "@pubky/passport-client";

const client = createPassportClient({
  instance: "https://passport.pubky.app",
  appName: "Example App",
  clientId: "example.app",
  capabilities: "/pub/example.app/:rw",
  profile: "required",
});
client.subscribe((view) => {
  button.textContent = view.label; // also view.status, view.tone, view.busy
  if (view.signedIn) keep(view.signedIn); // { session, publicKey, profile }
});
button.onclick = () => client.signIn(); // from the click: it opens Passport
```

The public API is exactly `createPassportClient(options)` with `signIn()`, `describe()`,
`subscribe(listener)`, `reset()` and `dispose()`. `signIn()` never rejects; it resolves
`{ status: "signed-in", session, publicKey, profile }`, `{ status: "failed", error }` (with
`error.code` and a readable `error.message`) or `{ status: "redirecting" }` when the pop-up was
blocked and this tab is going to Passport. Called while a sign-in is under way, it brings Passport
forward; while a required profile is missing, it opens Passport's profile page. `view.signedIn` holds
the same `{ session, publicKey, profile }` from the moment a Session arrives until `reset()`, however
the sign-in finished (pop-up, Pubky Ring or a same-tab return), so a subscriber sees every
sign-in; a new `signIn()` starts over and clears it. `reset()` also cancels a sign-in in progress. Options are the attributes' camel-case names
(`instance`, `appName`, `clientId`, `capabilities`, `profile`, `messages`); a bad value or any other key throws an error
named `PassportConfigError` whose `issues` name the options.

The first client created on a page (a `createPassportClient` call or an element) finishes a same-tab
return to that page, so a returning page must create it with the options the page left with.

## What your app receives and does

- A real `@synonymdev/pubky` `Session` with the requested capabilities (checked by the package).
  You own it: keep it, use it, and free it when you drop it.
- `publicKey` (show `pubky` + the key so people see who they are) and `profile`: the pubky.app
  profile read once after the sign-in and validated by `pubky-app-specs` (`name`, and optionally
  `bio`, `image` as a `pubky://` URL, `links`, `status`). With `profile: "required"` it is always
  there; with `"optional"` it is `null` when the person has none or it could not be read. Treat
  `profile.image` (a `pubky://` URL) and `profile.links[].url` as untrusted input: the specs accept
  any address, so render them as text or through your own allow-list. After a Pubky Ring sign-in
  that went through Passport's window, the profile is created inside that window too: the package
  holds the Session, asks the bound Passport (`profile-needed`), rereads the profile once Passport
  says it is published (`profile-ready`; a few quick retries cover a lagging homeserver) and then
  delivers the Session with the profile. If the person closed Passport meanwhile, the button reads
  "Finish your profile" and reopens Passport on that key's profile setup. A Ring scan of the large
  style's own QR never passes through Passport; the button then reads "Finish your profile" too.
- To survive a reload, save the Session with the SDK's session store
  (`new Pubky().browserSessionStore.save(session)`) and `restore(id)` it on start-up.
- To sign out: `await session.signout()`, then `reset()` on the element or client.
- Serve the page over HTTPS (the same-tab fallback needs it), allow the relay, PKARR relays and
  homeservers in `connect-src`, allow `'wasm-unsafe-eval'` for the SDK and the specs, and don't use
  `Cross-Origin-Opener-Policy: same-origin` (use `same-origin-allow-popups`).

The demo in `examples/passport-demo` shows all of this in one file, `src/passport.ts`.

## Details

Configuration defaults to identity-only capabilities and a required Pubky profile. Browser-derived
names and return paths are resolved on the first browser operation. A same-tab sign-in's saved
state lives at most 30 minutes. App names follow Passport's source-character rule:
joiners used in multilingual spelling and emoji are accepted; controls, bidi controls and zero-width
spaces are rejected. Configuration errors name the invalid option without echoing its value.

Runtime errors expose stable codes and text-only copy that apps can override. Their causes contain
only a recognized SDK error name (or `UnknownError`) and an optional HTTP status, never the original SDK error.
The default idle label says "Continue with Pubky"; later steps and the instance picker name Passport.

| Error detail                                          | Meaning                                                                                                                                                    |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `request_rejected` with `detail.rejection`            | A Passport parser/entry code, or `empty`; a missing code also means an invalid request. `empty` and browser-specific `history_unavailable` can be retried. |
| `popup_closed` with `detail.handshake: "unconfirmed"` | The popup closed before its handshake confirmed; the view may offer the developer default.                                                                 |
| `request_ended`                                       | Passport ended the request without an outcome reaching the app. This does not establish whether authorization succeeded; Retry starts again.               |

The `error.request_rejected.history_unavailable` message explains that Passport could not open the
request safely in this browser and offers Retry. Apps can override it like every other message.
Sign-in will report `request_ended` when Passport completes a request without sending an outcome,
except while the user is approving in Pubky Ring, when SDK polling continues. Its neutral copy is
overridable too.

## Security

The build checks the private manifest, peer versions and import locations, rejects the specified
unsafe API tokens in minified output and checks syntax for console access, code evaluation and HTML
sinks. It detects stale generated files and dangling exports and enforces minified gzip size budgets.
Source lint rules keep the package independent of Passport application code and
confine SDK, `pubky-app-specs` and QR encoder imports to their adapters. Workspace checks cover its tests and
build without adding package code to the Passport deployment.

The internal attempt runtime navigates with a flow's own pinned instance and sends every message
to that exact origin. It rejects a mismatched navigation origin before reading the private flow URL.
Replies must match the current window and origin, plus the attempt ID for v2;
legacy v1 outcomes use the window and origin checks. Replacing a window immediately unbinds its
predecessor, including while a fresh flow is still being created.
An outcome only changes progress; only a capability-checked SDK Session can authenticate.
Ending an attempt removes its message listener and window watch and closes its popup. A poll already
in flight is allowed to settle before its handle is freed, so a late Session retains its original
flow's delivery or revocation rules.

The internal profile step holds each capability-checked Session until one public SDK read of
`/pub/pubky.app/profile.json` settles (at most 64 KiB, 15 seconds), then validates the document with
`pubky-app-specs` (loaded on first use); a document that fails validation counts as no profile. With
`profile: "required"` a missing profile or failed read keeps the Session private and retries every
five seconds while visible, and on focus or return to the page; with `"optional"` the Session is
delivered with `profile: null`. Cancel, timeout and disposal revoke a held Session. A pop-up or
same-tab request tells Passport the requirement (in the hello, or as `profile=required` next to
`d=`), so Passport can have the person create the profile before approving; a Pubky Ring QR sign-in
does not pass through Passport and relies on the package's check. The SDK read may finish later;
its result is ignored after the attempt ends and its storage wrapper is freed when the read settles.
Real homeserver profile reads and Ring scans remain unverified.

The internal Session receiver claims ownership before inspecting SDK metadata. A handle already
seen by that client is never inspected or delivered again. An unreadable snapshot triggers sign-out,
one retry after two seconds if it fails, and handle cleanup on every outcome. Its error uses sanitized SDK metadata and the original
flow's instance, including after that flow has left the runner. A readable Session must still match
the requested capabilities before delivery. Diagnostic observers cannot interrupt this cleanup.

The internal click router opens Passport synchronously. If the browser returns `undefined`, it
retries once with `_blank`, preserving the exact URL and window features. A non-live retry keeps
the callback-free flow available through the relay; it never triggers same-tab fallback. Only a
blocked first call continues in the same tab. The activation diagnostic is
returned to the caller for delivery after it owns the window, without exposing the request URL.
The internal popup actions reserve the sign-in result before opening, so reentrant calls reuse the
same promise. Cancelled or otherwise unclaimed windows are closed. A queued click finishes its
ownership check and diagnostic only after its controller event runs; a Session observer can start
a new attempt without the previous click closing its window or settling its result. Reopen retains
the flow and pin, while the default-instance action opens a blank window for a fresh default flow.
Before flow creation finishes, another click only focuses a live window; if that window has
closed, the closure watcher ends the attempt and Retry creates a fresh flow. Once the opening
window has a flow, a click can replace a closed handle: it obtains a live replacement first, then
processes closure and reopens with the same URL, attempt and result. An unsuccessful native retry
changes no state. Reentrant observers cannot adopt that window into a different attempt.

The internal redirect store uses the initiating tab's `sessionStorage` and preserves the SDK's
saved state unchanged. Eligibility requires the same client fingerprint and a timestamp no older
than that client's TTL, capped at 30 minutes; future timestamps are ineligible. Its one-time startup
sweep can discard another client's well-formed record only beyond the global bound or when future-dated.
A valid return marker suspends the whole sweep so return handling can distinguish a bad record
from a missing one. Cleanup failures never expose stored state or native exception text.
If the system clock goes back past the redirect's start time, that same-tab
sign-in must end with `resume_failed`, and the user starts again.

Internal redirect preparation ignores a pending step's result after cancellation, replacement or
Session delivery. Only the current pinned callback flow receives the same-origin return URLs. Saving
uses the SDK's delegated state; a browser that cannot hold it cannot continue in the same tab. This preparation does not navigate,
poll or free the saved flow. The internal native handoff saves and reads back the record, sets
`window.opener` to null and verifies it, then assigns the fragment URL in one task. Only after
assignment returns does sign-in resolve `redirecting`. Refused opener severance or navigation
returns a constant `internal` error and deletes the owned record. A successful handoff keeps the
flow alive for navigation. Queued cancellation prevents a later native commit; a queued popup click
can apply only while its original sign-in result is still pending.

The private return reader confirms deletion with a storage read before returning saved state for
resume. A failed deletion or non-empty/failed read-back stops resume. It scrubs a valid return marker
separately and preserves another client's record and URL; without a marker it leaves the app's own
`errorCode` and `errorMessage` parameters alone. If the browser refuses `history.replaceState`,
the `pubky-passport` parameter stays in the address bar; it holds no secret. A successful deletion
still permits resume, and a reload of that stale marker has no saved record to consume.

The pinned Project Nayuki encoder is vendored under its MIT license.
[Third-party notices](./THIRD_PARTY_NOTICES.md) record its exact source and SHA-256;
tests reject any upstream byte change or change to the two permitted wrapper lines.

The large element renders the Ring QR as an accessible SVG in a closed shadow root, using one
module path, ECC Q (so the Pubky mark in its centre, under 5% of the code, can be restored) and a
four-module quiet zone, with `createElementNS` and no HTML parsing, data URLs or network requests.
It is always dark modules on white, whatever the page's theme; a request too large for Q falls back
to M without the mark. Rendered codes decode with zxing (checked in a browser at 232 px).

A custom relay or a long `appName`/`clientId` makes the QR denser. The SDK percent-encodes the
request, so each non-ASCII `appName` character costs 9–12 bytes. The measured SDK 0.11.0 vector
with a 128-character ASCII name and 256-character relay is 591 bytes: version 19 (93×93), mask 2,
at ECC M. Tests compare rendered module grids with the untouched upstream encoder, compiled
independently using plain TypeScript; the recorded hashes include version and mask geometry.
The element's QR cutoff is 2,331 UTF-8 bytes (ECC M, without the mark; up to about 1,663 bytes it
uses Q with the mark); above it, Ring can only be opened through "Open in Pubky Ring" on the same
device.

The demo (`examples/passport-demo`) signs in through this package only; its runtime dependencies
are this package and its two peers.

## Limitations

Abandoned sign-in attempts can leave one non-extractable, pending proof-of-possession key per
attempt in the browser's `pubky-auth` IndexedDB database. It cannot be exported, is useless without
the flow's relay secret, and is not cleared by this package. The package never calls
`browserSessionStore.clearAll()` or accesses SDK stores directly. Apps that own their origin's
Pubky state may call the SDK's `clearAll()` themselves at sign-out.

## Size budgets

Entry sizes include static relative imports and the full closure of dynamically imported modules;
peers (the SDK and `pubky-app-specs`) are not counted. Every import target is checked for existence
and import policy. The planned ceilings were 12 KiB core and 22 KiB element; the build currently
allows a provisional 32 KiB and 42 KiB (measured about 30.1 KiB and 41.2 KiB gzip) until the
maintainer decides.

## Development

Instance choices (the element's "Use a different Passport") belong to each app's origin and are
never shared across apps. The canonical URL rules are the 76 vectors at repository path
`packages/passport-client/test-vectors/instance-origin.json`; future Passport operator-URL checks
must pass the same vectors. The `instance` option and people's choices require HTTPS domain
origins, excluding IP and localhost addresses (only the package's own tests may use loopback). Choices are revalidated on each read and storage failures fall back to page-local memory.
Domain labels use ASCII letters, digits and interior hyphens after URL punycode normalization,
with a 63-character label limit and 253-character host limit. Port zero is rejected.
After a failed write, removing the old saved choice is attempted so reload cannot restore it
when removal is available. Reset also attempts removal even after a storage failure.

Run `pnpm --filter @pubky/passport-client test` for unit tests, or `pnpm check` at the repository root
for the complete workspace checks.
