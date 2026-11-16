import { useEffect, useState } from "react";

import { atom, useSetAtom } from "../app-jotai";
import { EverTeamsLogo } from "../components/ever-teams-logo";
import { EVER_TEAMS_URL } from "../app_constants";

import type { CSSProperties, PropsWithChildren } from "react";

const GAUZY_API_URL = import.meta.env.VITE_APP_GAUZY_API_URL;
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

const fetchAuthUser = async (access_token: string) => {
  return fetch(`${GAUZY_API_URL}/user/me`, {
    headers: {
      Authorization: `Bearer ${access_token}`,
    },
  }).then<AuthUser>((res) => res.json());
};

export function Authenticator(props: PropsWithChildren) {
  //  return <>{props.children}</>;
  const setAuthUser = useSetAtom(authUserAtom);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    const access_token = getAccessTokenCookie();
    if (!access_token) {
      setAuthenticated(false);
      return;
    }

    fetchAuthUser(access_token)
      .then((user) => {
        setAuthUser(user);
        setAuthenticated(true);
      })
      .catch(() => setAuthenticated(false));
  }, [setAuthUser]);

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
      {authenticated === false && <UnauthorizedMessage />}
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

function UnauthorizedMessage() {
  return (
    <div style={style}>
      <div>Access denied</div>

      <a
        href={`${EVER_TEAMS_URL}/auth/passcode?redirect=${encodeURIComponent(
          location.href,
        )}`}
        style={{ marginTop: "1rem", color: "#6755c9" }}
      >
        Login
      </a>
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

export interface AuthUser {
  id: string;
  createdAt: string;
  updatedAt: string;
  tenantId: string;
  thirdPartyId: any;
  firstName: string;
  lastName: any;
  email: string;
  phoneNumber: any;
  username: any;
  timeZone: any;
  imageUrl: string;
  preferredLanguage: string;
  preferredComponentLayout: string;
  isActive: boolean;
  roleId: string;
  imageId: any;
  image: any;
  name: string;
  employeeId: any;
  isEmailVerified: boolean;
}
