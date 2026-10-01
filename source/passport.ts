/**
 * This demo's whole Pubky Passport integration. Copy from here; everything else in src/ is page
 * UI (app.ts, styles.ts, explainer.ts, dom.ts, style.css), the playground's settings (settings.ts,
 * config.ts) and the file storage the signed-in page uses (storage.ts, files.ts).
 *
 * 1. Configure: the <pubky-passport> element and the headless client take the same options.
 * 2. Sign in: the element fires `passport-session`; the headless client puts the same thing in
 *    `view.signedIn`. Either way the app gets the SDK Session, the public key and the profile.
 *    One page may have several sign-in buttons, so this app takes the first Session and signs a
 *    second one out.
 * 3. Keep: save the Session with the SDK's browser session store.
 * 4. Restore: on load, restore the saved Session, so a reload stays signed in.
 * 5. Sign out: revoke the grant, forget the saved Session, and reset() every sign-in button.
 */
import "@pubky/passport-client/element"; // defines <pubky-passport>
import type {
  PassportClient,
  PassportClientOptions,
  PassportProfile,
  SignedIn,
} from "@pubky/passport-client";
import type { PassportElement } from "@pubky/passport-client/element";
import { Pubky } from "@synonymdev/pubky";
import { APP_CAPABILITIES, APP_CLIENT_ID, APP_NAME, STORAGE_NAMESPACE } from "./config";
import { freeHandle } from "./freeHandle";

export interface PassportSettings {
  /** The Passport (an https origin) people sign in with. */
  instance: string;
  /** "required": sign-in finishes only once the person has a pubky.app profile. */
  profile: "required" | "optional";
}

// 1. Configure ------------------------------------------------------------------------------

/** One set of options for every sign-in surface on the page. */
export function passportOptions(settings: PassportSettings) {
  return {
    instance: settings.instance,
    // Passport shows the name and ID to the person approving the sign-in.
    appName: APP_NAME,
    clientId: APP_CLIENT_ID,
    // What the Session may do on the person's homeserver: read and write this app's folder.
    capabilities: APP_CAPABILITIES,
    profile: settings.profile,
  } satisfies PassportClientOptions;
}

/**
 * The element is configured by its attributes. Set them before the element joins the page: when
 * Passport sends someone back to this page in the same tab (a blocked pop-up), the first client or
 * element created on the page finishes that sign-in, and it must have the options the page left
 * with.
 */
export function configureElement(element: PassportElement, settings: PassportSettings): void {
  const options = passportOptions(settings);
  element.setAttribute("instance", options.instance);
  element.setAttribute("app-name", options.appName);
  element.setAttribute("client-id", options.clientId);
  element.setAttribute("capabilities", options.capabilities);
  element.setAttribute("profile", options.profile);
}

// 2. Signed in ------------------------------------------------------------------------------

/** What the page does when someone signs in or out; passport.ts owns everything in between. */
export interface SignInHandlers {
  signedIn(signedIn: SignedIn): void;
  signedOut(): void;
}

/**
 * Wires sign-in buttons to the app: `watch(element)` and `watch(client)` take each surface's
 * Session, `restore()` brings a saved one back on load, `signOut()` ends it. The first Session to
 * arrive is the app's; a second one (another button) is signed out and freed.
 */
export function createSignIn(handlers: SignInHandlers) {
  let current: SignedIn | undefined;
  const take = async (signedIn: SignedIn, saved: boolean) => {
    if (current) {
      if (signedIn.session !== current.session) {
        await signedIn.session.signout().catch(() => {});
        signedIn.session.free();
      }
      return;
    }
    current = signedIn;
    handlers.signedIn(signedIn);
    // 3. Keep it for a reload. A failure only means a reload asks to sign in again.
    if (!saved) await keepSignIn(signedIn).catch(() => {});
  };
  return {
    /** Takes what the element's `passport-session` event or the client's view hands over. */
    watch(surface: PassportElement | PassportClient): void {
      if ("subscribe" in surface)
        surface.subscribe((view) => void (view.signedIn && take(view.signedIn, false)));
      else surface.addEventListener("passport-session", (event) => void take(event.detail, false));
    },
    /** 4. On load: the Session an earlier visit saved, while its grant is still valid. */
    async restore(): Promise<void> {
      const saved = await restoreSignIn();
      if (saved) await take(saved, true);
    },
    /** 5. `surfaces` are the page's elements and clients: each gets its button back. */
    async signOut(surfaces: readonly { reset(): void }[]): Promise<void> {
      const signedIn = current;
      if (!signedIn) return;
      current = undefined;
      await endSignIn(signedIn);
      for (const surface of surfaces) surface.reset();
      handlers.signedOut();
    },
  };
}

// 3. and 4. The saved Session ---------------------------------------------------------------

// The app's own SDK instance, for its session store. The package signs in with its own.
const pubky = new Pubky();
const SAVED_KEY = `${STORAGE_NAMESPACE}:signed-in`;

/** What the app remembers about a saved sign-in; the Session itself is in the SDK's store. */
interface SavedSignIn {
  /** The SDK session store's ID for the Session. */
  id: string;
  publicKey: string;
  profile: PassportProfile | null;
}

/** Errors that mean the saved Session is gone for good; anything else may be a passing failure. */
const INVALID_SAVED_SESSION_ERRORS = new Set([
  "AuthenticationError",
  "InvalidInput",
  "ClientStateError",
]);

/** Saves the Session with the SDK's store; the app keeps only the store's ID and public facts. */
export async function keepSignIn(signedIn: SignedIn): Promise<void> {
  const store = pubky.browserSessionStore;
  let stored: { id: string; free(): void } | undefined;
  try {
    stored = await store.save(signedIn.session);
    const saved: SavedSignIn = {
      id: stored.id,
      publicKey: signedIn.publicKey,
      // The profile is public data; a copy lets a reload show the name without reading it again.
      profile: signedIn.profile,
    };
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
    } catch (e) {
      // Without the ID the record could never be found again: don't leave it behind.
      await store.remove(stored.id).catch(() => {});
      throw e;
    }
  } finally {
    freeHandle(stored);
    freeHandle(store);
  }
}

/** The Session an earlier visit saved, or nothing. */
export async function restoreSignIn(): Promise<SignedIn | undefined> {
  const saved = readSaved();
  if (!saved) return undefined;
  const store = pubky.browserSessionStore;
  try {
    const session = await store.restore(saved.id);
    return { session, publicKey: saved.publicKey, profile: saved.profile };
  } catch (e) {
    // Expired or revoked: forget it. Anything else (offline, a busy browser) keeps it for later.
    if (INVALID_SAVED_SESSION_ERRORS.has((e as { name?: string })?.name ?? "")) {
      forgetSaved();
      await store.remove(saved.id).catch(() => {});
    }
    return undefined;
  } finally {
    freeHandle(store);
  }
}

// 5. Sign out -------------------------------------------------------------------------------

/** Revokes the grant on the homeserver, forgets the saved Session and frees it. */
async function endSignIn(signedIn: SignedIn): Promise<void> {
  // Offline or already revoked: the local copy is still forgotten below.
  await signedIn.session.signout().catch(() => {});
  freeHandle(signedIn.session);
  const saved = readSaved();
  forgetSaved();
  if (!saved) return;
  const store = pubky.browserSessionStore;
  try {
    await store.remove(saved.id);
  } catch {
    // Already gone.
  } finally {
    freeHandle(store);
  }
}

function readSaved(): SavedSignIn | undefined {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVED_KEY) ?? "null") as SavedSignIn | null;
    return saved && typeof saved.id === "string" ? saved : undefined;
  } catch {
    return undefined;
  }
}

function forgetSaved(): void {
  try {
    localStorage.removeItem(SAVED_KEY);
  } catch {
    // Nothing was saved.
  }
}
