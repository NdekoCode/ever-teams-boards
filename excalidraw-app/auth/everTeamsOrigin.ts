import { atom } from "jotai";
import { appJotaiStore } from "../app-jotai";
import { STORAGE_KEYS } from "../app_constants";

/**
 * Query parameter Ever Teams adds to the Board address when it opens the
 * Board, e.g. `?origin=https%3A%2F%2Fdemo.ever.team`.
 */
export const EVER_TEAMS_ORIGIN_PARAM = "origin";

const LOOPBACK_HOSTNAMES = ["localhost", "127.0.0.1", "[::1]"];

export type EverTeamsOriginConfig = {
  /** Origin of VITE_APP_EVER_TEAMS_URL, used when a visit names no other. */
  defaultOrigin: string | null;
  /** Origins the Board may use, the default one included. */
  allowedOrigins: string[];
  /** Development builds also accept http on a loopback host. */
  allowLocalHttp: boolean;
};

/**
 * Returns the serialized origin (`scheme://host[:port]`) of `value`, or null
 * when the Board must not talk to it: anything that is not an absolute https
 * URL (or http on a loopback host when `allowLocalHttp` is set), and any URL
 * carrying a user name or a password.
 */
export const toEverTeamsOrigin = (
  value: string | null | undefined,
  allowLocalHttp: boolean,
): string | null => {
  if (!value) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    return null;
  }

  if (url.username || url.password) {
    return null;
  }

  const isLocalHttp =
    allowLocalHttp &&
    url.protocol === "http:" &&
    LOOPBACK_HOSTNAMES.includes(url.hostname);
  if (url.protocol !== "https:" && !isLocalHttp) {
    return null;
  }

  return url.origin;
};

/**
 * Reads the allowlist from the build settings: the origin of
 * VITE_APP_EVER_TEAMS_URL plus the comma-separated origins of
 * VITE_APP_EVER_TEAMS_ORIGINS. Invalid entries are left out.
 */
export const getEverTeamsOriginConfig = (
  everTeamsUrl: string | undefined,
  everTeamsOrigins: string | undefined,
  allowLocalHttp: boolean,
): EverTeamsOriginConfig => {
  const toConfiguredOrigin = (value: string | undefined, setting: string) => {
    const trimmed = value?.trim();
    if (!trimmed) {
      return null;
    }
    const origin = toEverTeamsOrigin(trimmed, allowLocalHttp);
    if (!origin) {
      console.warn(`Ignoring "${trimmed}" in ${setting}: not an https origin`);
    }
    return origin;
  };

  const defaultOrigin = toConfiguredOrigin(
    everTeamsUrl,
    "VITE_APP_EVER_TEAMS_URL",
  );
  const listedOrigins = (everTeamsOrigins || "")
    .split(",")
    .map((value) => toConfiguredOrigin(value, "VITE_APP_EVER_TEAMS_ORIGINS"));
  const allowedOrigins = new Set(
    [defaultOrigin, ...listedOrigins].filter(
      (origin): origin is string => origin !== null,
    ),
  );

  return {
    defaultOrigin,
    allowedOrigins: Array.from(allowedOrigins),
    allowLocalHttp,
  };
};

type OriginStorage = Pick<Storage, "getItem" | "setItem">;

const readRememberedOrigin = (storage: OriginStorage | null) => {
  try {
    return (
      storage?.getItem(STORAGE_KEYS.LOCAL_STORAGE_EVER_TEAMS_ORIGIN) ?? null
    );
  } catch (error) {
    return null;
  }
};

const rememberOrigin = (storage: OriginStorage | null, origin: string) => {
  try {
    storage?.setItem(STORAGE_KEYS.LOCAL_STORAGE_EVER_TEAMS_ORIGIN, origin);
  } catch (error) {
    // Storage full or blocked: the origin is simply not remembered.
  }
};

/**
 * Chooses the Ever Teams deployment of a visit: the origin named by the
 * `origin` query parameter when it is allowed (it is then remembered), else
 * the origin remembered from an earlier visit when it is still allowed, else
 * the default origin. Candidates are parsed, then their origin is compared
 * exactly with the allowlist: the query parameter is never trusted on its
 * own, as it decides where people sign in and whom the Board asks about
 * their session.
 */
export const resolveEverTeamsOrigin = (
  search: string,
  storage: OriginStorage | null,
  config: EverTeamsOriginConfig,
): string | null => {
  const toAllowedOrigin = (value: string | null) => {
    const origin = toEverTeamsOrigin(value, config.allowLocalHttp);
    return origin && config.allowedOrigins.includes(origin) ? origin : null;
  };

  const requestedOrigin = toAllowedOrigin(
    new URLSearchParams(search).get(EVER_TEAMS_ORIGIN_PARAM),
  );
  if (requestedOrigin) {
    rememberOrigin(storage, requestedOrigin);
    return requestedOrigin;
  }

  return toAllowedOrigin(readRememberedOrigin(storage)) ?? config.defaultOrigin;
};

/** The Ever Teams origin of the current visit, see resolveEverTeamsOrigin. */
export const getEverTeamsOrigin = (): string | null => {
  let storage: Storage | null = null;
  try {
    storage = window.localStorage;
  } catch (error) {
    // Storage blocked by the browser: the origin is not remembered.
  }

  return resolveEverTeamsOrigin(
    window.location.search,
    storage,
    getEverTeamsOriginConfig(
      import.meta.env.VITE_APP_EVER_TEAMS_URL,
      import.meta.env.VITE_APP_EVER_TEAMS_ORIGINS,
      import.meta.env.DEV,
    ),
  );
};

/**
 * The Ever Teams origin of this visit, for everything that needs it: the
 * session check, the sign-in link, links back to Ever Teams and shareable
 * Board addresses. A store chooses it once, on the first read, which the
 * Authenticator makes before the app rewrites the address.
 */
export const everTeamsOriginAtom = atom<string | null>(() =>
  getEverTeamsOrigin(),
);

/**
 * Sets the `origin` parameter of a Board address to `everTeamsOrigin`, or
 * removes it when there is none, so an `origin` copied from the current
 * address is never passed on as is.
 */
export const withEverTeamsOrigin = (
  boardUrl: string,
  everTeamsOrigin: string | null,
): string => {
  const url = new URL(boardUrl);
  if (everTeamsOrigin) {
    url.searchParams.set(EVER_TEAMS_ORIGIN_PARAM, everTeamsOrigin);
  } else if (url.searchParams.has(EVER_TEAMS_ORIGIN_PARAM)) {
    url.searchParams.delete(EVER_TEAMS_ORIGIN_PARAM);
  }
  return url.toString();
};

/**
 * A shareable Board address carrying the Ever Teams origin of this visit, so
 * whoever opens it signs in on the same deployment. Only that origin, which
 * is always an allowed one, is ever written.
 */
export const toShareableBoardUrl = (boardUrl: string): string =>
  withEverTeamsOrigin(boardUrl, appJotaiStore.get(everTeamsOriginAtom) ?? null);
