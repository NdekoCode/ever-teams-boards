import { atom, useAtomValue, useSetAtom } from "jotai";
import { CSSProperties, PropsWithChildren, useEffect, useState } from "react";
import { EverTeamsLogo } from "../components/ever-teams-logo";
import { everTeamsOriginAtom } from "./everTeamsOrigin";

const TOKEN_COOKIE_NAME = "auth-token";
const style = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  height: "100%",
  fontSize: "1.2rem",
  fontWeight: "normal",
  fontFamily: "sans-serif",
  flexDirection: "column" as CSSProperties["flexDirection"],
};

export const authUserAtom = atom<AuthUser | null>(null);

const toAuthUser = (data: unknown): AuthUser | null => {
  if (!data || typeof data !== "object") {
    return null;
  }
  const { id, name, imageUrl } = data as Record<string, unknown>;
  if (typeof id !== "string" || !id) {
    return null;
  }
  return {
    id,
    name: typeof name === "string" ? name : "",
    imageUrl: typeof imageUrl === "string" ? imageUrl : "",
  };
};

type BoardSession =
  | { status: "signed-in"; user: AuthUser }
  | { status: "signed-out" }
  | { status: "unavailable" };

/**
 * Asks the Ever Teams deployment at `everTeamsOrigin` who is signed in. The
 * browser sends that deployment's own session cookies along; no token
 * reaches the Board. 200 means signed in, 401 signed out; anything else
 * (404 from a deployment without the route, 403, 503, a network or CORS
 * failure) means the session could not be checked.
 */
const fetchBoardSession = async (
  everTeamsOrigin: string,
): Promise<BoardSession> => {
  try {
    const res = await fetch(`${everTeamsOrigin}/api/board/session`, {
      credentials: "include",
    });
    if (res.status === 401) {
      return { status: "signed-out" };
    }
    const user = res.ok ? toAuthUser(await res.json()) : null;
    if (user) {
      return { status: "signed-in", user };
    }
    console.warn(
      `Board session check at ${everTeamsOrigin} answered ${res.status}, trying the ${TOKEN_COOKIE_NAME} cookie`,
    );
  } catch (error) {
    console.warn(
      `Board session check at ${everTeamsOrigin} failed, trying the ${TOKEN_COOKIE_NAME} cookie`,
      error,
    );
  }
  return { status: "unavailable" };
};

/**
 * Check used before /api/board/session existed, kept for Ever Teams
 * deployments that do not serve it yet: the `auth-token` cookie, when the
 * Board can read it, is checked against the Gauzy API.
 */
const fetchLegacyAuthUser = async (): Promise<AuthUser | null> => {
  const gauzyApiUrl = import.meta.env.VITE_APP_GAUZY_API_URL;
  try {
    const access_token = getAccessTokenCookie();
    if (!gauzyApiUrl || !access_token) {
      return null;
    }
    const res = await fetch(`${gauzyApiUrl}/user/me`, {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });
    return res.ok ? toAuthUser(await res.json()) : null;
  } catch (error) {
    console.warn(`${TOKEN_COOKIE_NAME} cookie check failed`, error);
    return null;
  }
};

const authenticate = async (
  everTeamsOrigin: string | null,
): Promise<AuthUser | null> => {
  if (everTeamsOrigin) {
    const session = await fetchBoardSession(everTeamsOrigin);
    if (session.status === "signed-in") {
      return session.user;
    }
    if (session.status === "signed-out") {
      return null;
    }
  }
  return fetchLegacyAuthUser();
};

export function Authenticator(props: PropsWithChildren) {
  //  return <>{props.children}</>;
  const setAuthUser = useSetAtom(authUserAtom);
  // The Ever Teams deployment of this visit, see everTeamsOrigin.ts
  const everTeamsOrigin = useAtomValue(everTeamsOriginAtom);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    authenticate(everTeamsOrigin).then((user) => {
      if (cancelled) {
        return;
      }
      setAuthUser(user);
      setAuthenticated(user !== null);
    });

    return () => {
      cancelled = true;
    };
  }, [everTeamsOrigin, setAuthUser]);

  return (
    <>
      {authenticated === null && (
        <div
          style={{
            ...style,
            fontSize: "0.8rem",
          }}
        >
          Loading...
        </div>
      )}
      {authenticated === false && (
        <UnauthorizedMessage everTeamsOrigin={everTeamsOrigin} />
      )}
      {authenticated && (
        <>
          <EverTeamsLogo
            style={{
              transform: "scale(0.75)",
              position: "fixed",
              top: "1.25rem",
              left: "3.5rem",
              zIndex: 10,
            }}
          />
          <div style={{ height: "100%", width: "100%" }}>{props.children}</div>
        </>
      )}
    </>
  );
}

function UnauthorizedMessage({
  everTeamsOrigin,
}: {
  everTeamsOrigin: string | null;
}) {
  return (
    <div style={style}>
      <div>Access denied</div>

      {everTeamsOrigin && (
        <a
          href={`${everTeamsOrigin}/auth/passcode?redirect=${encodeURIComponent(
            location.href,
          )}`}
          style={{ marginTop: "1rem", color: "#6755c9" }}
        >
          Login
        </a>
      )}
    </div>
  );
}

function getAccessTokenCookie() {
  const totalChunksCookie = getTotalChunksCookie(TOKEN_COOKIE_NAME);
  if (totalChunksCookie) {
    return getLargeStringFromCookies(TOKEN_COOKIE_NAME);
  }

  return getCookie(TOKEN_COOKIE_NAME);
}

function getTotalChunksCookie(COOKIE_NAME: string) {
  return getCookie(`${COOKIE_NAME}_totalChunks`);
}

const getLargeStringFromCookies = (COOKIE_NAME: string) => {
  const totalChunksCookie = getTotalChunksCookie(COOKIE_NAME);
  if (!totalChunksCookie) {
    return null; // Total chunks cookie not found.
  }

  const totalChunks = parseInt(totalChunksCookie);

  const chunks = range(totalChunks).map((index) => {
    const chunkCookie = getCookie(`${COOKIE_NAME}${index}`);
    if (!chunkCookie) {
      return null; // Chunk cookie not found.
    }

    return chunkCookie;
  });

  // Concatenate and return the large string.
  return chunks.join("");
};

function getCookie(name: string): string | null {
  const cookies = document.cookie.split("; ");
  for (let i = 0; i < cookies.length; i++) {
    const cookie = cookies[i].split("=");
    const cookieName = decodeURIComponent(cookie[0]);
    if (cookieName === name) {
      return decodeURIComponent(cookie[1]);
    }
  }
  return null;
}

function range(start: number, end?: number, step = 1): number[] {
  const result: number[] = [];

  if (step === 0) {
    throw new Error("Step cannot be zero.");
  }

  if (end === undefined) {
    end = start;
    start = 0;
  }

  if ((start < end && step < 0) || (start > end && step > 0)) {
    return result; // Empty array for invalid input.
  }

  for (let i = start; step > 0 ? i < end : i > end; i += step) {
    result.push(i);
  }

  return result;
}

/** What the Board needs to know about the signed-in person. */
export interface AuthUser {
  id: string;
  name: string;
  imageUrl: string;
}
