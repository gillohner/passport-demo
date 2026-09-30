/**
 * This demo's whole Pubky Passport integration. Copy from here; the rest of src/ is page UI
 * (app.ts) and the file storage the signed-in page uses (storage.ts, files.ts).
 *
 * 1. Configure: the <pubky-passport> element and the headless client take the same options.
 * 2. Sign in: the element fires `passport-session`; the headless client puts the same thing in
 *    `view.signedIn`. Either way the app gets the SDK Session, the public key and the profile.
 * 3. Keep: save the Session with the SDK's browser session store.
 * 4. Restore: on load, restore the saved Session, so a reload stays signed in.
 * 5. Sign out: revoke the grant, forget the saved Session, and reset() every sign-in button.
 */
import "@pubky/passport-client/element"; // defines <pubky-passport>
import {
  createPassportClient,
  type PassportClient,
  type PassportClientOptions,
  type PassportProfile,
  type SignedIn,
} from "@pubky/passport-client";
import type { PassportElement } from "@pubky/passport-client/element";
import { Pubky } from "@synonymdev/pubky";
import { APP_CLIENT_ID, APP_NAME, CAPABILITIES, STORAGE_NAMESPACE } from "./config";

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
    capabilities: CAPABILITIES,
    profile: settings.profile,
  } satisfies PassportClientOptions;
}

/**
 * The element is configured by its attributes. Set them before the element joins the page: when
 * Passport sends someone back to this page in the same tab (a blocked pop-up), the first button
 * created on the page finishes that sign-in, and it must have the options the page left with.
 */
export function configureElement(element: PassportElement, settings: PassportSettings): void {
  const options = passportOptions(settings);
  element.setAttribute("instance", options.instance);
  element.setAttribute("app-name", options.appName);
  element.setAttribute("client-id", options.clientId);
  element.setAttribute("capabilities", options.capabilities);
  element.setAttribute("profile", options.profile);
}

/**
 * A button of your own design uses the headless client: render `describe()` (and every view
 * `subscribe()` passes), call `signIn()` from the click, and read `view.signedIn`.
 */
export function createHeadlessClient(settings: PassportSettings): PassportClient {
  return createPassportClient(passportOptions(settings));
}

// 2. and 3. Signed in: keep the Session -----------------------------------------------------

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

/**
 * Call with what `passport-session` or `view.signedIn` hands over. The app owns the Session from
 * here: saving it lets a reload restore it. A failure only means a reload asks to sign in again.
 */
export async function keepSignIn(signedIn: SignedIn): Promise<void> {
  const store = pubky.browserSessionStore;
  try {
    const stored = await store.save(signedIn.session);
    // The profile is public data; a copy lets a reload show the name without reading it again.
    const saved: SavedSignIn = {
      id: stored.id,
      publicKey: signedIn.publicKey,
      profile: signedIn.profile,
    };
    stored.free();
    localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
  } finally {
    store.free();
  }
}

// 4. Restore on load ------------------------------------------------------------------------

/** The Session an earlier visit saved, while its grant is still valid. */
export async function restoreSignIn(): Promise<SignedIn | undefined> {
  const saved = readSaved();
  if (!saved) return undefined;
  const store = pubky.browserSessionStore;
  try {
    const session = await store.restore(saved.id);
    return { session, publicKey: saved.publicKey, profile: saved.profile };
  } catch {
    // Expired, revoked or cleared by the browser: forget it and offer sign-in again.
    forgetSaved();
    await store.remove(saved.id).catch(() => {});
    return undefined;
  } finally {
    store.free();
  }
}

// 5. Sign out -------------------------------------------------------------------------------

/**
 * Revokes the grant on the homeserver, forgets the saved Session and frees it, then resets the
 * sign-in buttons (elements and headless clients both have reset()) so they offer sign-in again.
 */
export async function signOut(
  signedIn: SignedIn,
  buttons: readonly { reset(): void }[],
): Promise<void> {
  // Offline or already revoked: the local copy is still forgotten below.
  await signedIn.session.signout().catch(() => {});
  signedIn.session.free();
  const saved = readSaved();
  forgetSaved();
  if (saved) {
    const store = pubky.browserSessionStore;
    try {
      await store.remove(saved.id);
    } catch {
      // Already gone.
    } finally {
      store.free();
    }
  }
  for (const button of buttons) button.reset();
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
