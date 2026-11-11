import { unstable_createStore } from "jotai";
import { vi } from "vitest";
import { STORAGE_KEYS } from "../app_constants";
import {
  EverTeamsOriginConfig,
  everTeamsOriginAtom,
  getEverTeamsOriginConfig,
  resolveEverTeamsOrigin,
  withEverTeamsOrigin,
} from "../auth/everTeamsOrigin";

const REMEMBERED_ORIGIN_KEY = STORAGE_KEYS.LOCAL_STORAGE_EVER_TEAMS_ORIGIN;
const EVER_TEAMS_URL = "https://app.ever.team";
const EVER_TEAMS_ORIGINS =
  "https://app.ever.team,https://demo.ever.team,https://stage.ever.team";

const productionConfig = getEverTeamsOriginConfig(
  EVER_TEAMS_URL,
  EVER_TEAMS_ORIGINS,
  false,
);
const developmentConfig = getEverTeamsOriginConfig(
  EVER_TEAMS_URL,
  `${EVER_TEAMS_ORIGINS},http://localhost:3030`,
  true,
);

/** Query string of a Board address as Ever Teams builds it. */
const boardSearch = (origin: string) =>
  `?${new URLSearchParams({ live: "true", members: "m1,m2", origin })}`;

const resolve = (
  search: string,
  config: EverTeamsOriginConfig = productionConfig,
) => resolveEverTeamsOrigin(search, localStorage, config);

const HOSTILE_ORIGINS = [
  // script and other non-http(s) schemes
  // eslint-disable-next-line no-script-url
  "javascript:alert(document.domain)",
  // eslint-disable-next-line no-script-url
  "JavaScript:alert(1)",
  // eslint-disable-next-line no-script-url
  "javascript://demo.ever.team/%0Aalert(1)",
  "data:text/html,<script>alert(1)</script>",
  "blob:https://demo.ever.team/0f8b6d3e",
  "file:///etc/passwd",
  "ftp://demo.ever.team",
  "wss://demo.ever.team",
  // plain http outside development
  "http://demo.ever.team",
  // user names and passwords
  "https://user@demo.ever.team",
  "https://user:secret@demo.ever.team",
  "https://:secret@demo.ever.team",
  "https://demo.ever.team@evil.example",
  // look-alike hosts and other origins, sibling subdomains included
  "https://evil.ever.team",
  "https://board.ever.team",
  "https://demo.ever.team.evil.example",
  "https://demo.ever.tearn",
  "https://demo-ever.team",
  "https://ever.team",
  "https://demo.ever.team.",
  "https://demo.ever.team:8443",
  "https://demo.еver.team",
  "https://evil.example/https://demo.ever.team",
  "https://evil.example/?origin=https://demo.ever.team",
  "https://evil.example#https://demo.ever.team",
  // not absolute URLs
  "//demo.ever.team",
  "demo.ever.team",
  "/auth/passcode",
  "",
];

describe("getEverTeamsOriginConfig", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("allows the origin of VITE_APP_EVER_TEAMS_URL and every listed origin", () => {
    expect(
      getEverTeamsOriginConfig(
        "https://app.ever.team/some/page",
        " https://demo.ever.team , ,https://stage.ever.team/,https://app.ever.team",
        false,
      ),
    ).toEqual({
      defaultOrigin: "https://app.ever.team",
      allowedOrigins: [
        "https://app.ever.team",
        "https://demo.ever.team",
        "https://stage.ever.team",
      ],
      allowLocalHttp: false,
    });
  });

  it("always allows the default origin, even without a list", () => {
    expect(
      getEverTeamsOriginConfig(EVER_TEAMS_URL, undefined, false).allowedOrigins,
    ).toEqual(["https://app.ever.team"]);
  });

  it("leaves out and reports entries that are not https origins", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(
      getEverTeamsOriginConfig(
        // eslint-disable-next-line no-script-url
        "javascript:alert(1)",
        "http://demo.ever.team,demo.ever.team,https://user@stage.ever.team,https://stage.ever.team",
        false,
      ),
    ).toEqual({
      defaultOrigin: null,
      allowedOrigins: ["https://stage.ever.team"],
      allowLocalHttp: false,
    });
    expect(warn).toHaveBeenCalledTimes(4);
  });

  it("allows http on localhost in development only", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const origins =
      "https://demo.ever.team,http://localhost:3030,http://127.0.0.1:3030,http://dev.ever.team";

    expect(
      getEverTeamsOriginConfig(EVER_TEAMS_URL, origins, true).allowedOrigins,
    ).toEqual([
      "https://app.ever.team",
      "https://demo.ever.team",
      "http://localhost:3030",
      "http://127.0.0.1:3030",
    ]);
    expect(
      getEverTeamsOriginConfig(EVER_TEAMS_URL, origins, false).allowedOrigins,
    ).toEqual(["https://app.ever.team", "https://demo.ever.team"]);
  });

  it("has no default origin when VITE_APP_EVER_TEAMS_URL is not set", () => {
    expect(
      getEverTeamsOriginConfig(undefined, "https://demo.ever.team", false),
    ).toEqual({
      defaultOrigin: null,
      allowedOrigins: ["https://demo.ever.team"],
      allowLocalHttp: false,
    });
  });
});

describe("resolveEverTeamsOrigin", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("uses an allowed origin parameter and remembers it", () => {
    expect(resolve(boardSearch("https://demo.ever.team"))).toBe(
      "https://demo.ever.team",
    );
    expect(localStorage.getItem(REMEMBERED_ORIGIN_KEY)).toBe(
      "https://demo.ever.team",
    );
  });

  it("compares the parsed origin of the parameter", () => {
    expect(resolve(boardSearch("https://stage.ever.team/"))).toBe(
      "https://stage.ever.team",
    );
    expect(resolve(boardSearch("https://DEMO.ever.team:443"))).toBe(
      "https://demo.ever.team",
    );
  });

  it("uses the remembered origin when the visit names none", () => {
    localStorage.setItem(REMEMBERED_ORIGIN_KEY, "https://stage.ever.team");

    expect(resolve("")).toBe("https://stage.ever.team");
    expect(resolve("?live=true")).toBe("https://stage.ever.team");
  });

  it("prefers an allowed origin parameter to the remembered one", () => {
    localStorage.setItem(REMEMBERED_ORIGIN_KEY, "https://stage.ever.team");

    expect(resolve(boardSearch("https://demo.ever.team"))).toBe(
      "https://demo.ever.team",
    );
    expect(localStorage.getItem(REMEMBERED_ORIGIN_KEY)).toBe(
      "https://demo.ever.team",
    );
  });

  it("falls back to the default origin", () => {
    expect(resolve("")).toBe("https://app.ever.team");
    expect(resolve("?live=true&members=m1")).toBe("https://app.ever.team");
  });

  it("ignores a remembered origin that is no longer allowed", () => {
    localStorage.setItem(REMEMBERED_ORIGIN_KEY, "https://old.ever.team");

    expect(resolve("")).toBe("https://app.ever.team");
  });

  it.each(HOSTILE_ORIGINS)("rejects the origin parameter %j", (origin) => {
    localStorage.setItem(REMEMBERED_ORIGIN_KEY, "https://stage.ever.team");

    expect(resolve(boardSearch(origin))).toBe("https://stage.ever.team");
    expect(localStorage.getItem(REMEMBERED_ORIGIN_KEY)).toBe(
      "https://stage.ever.team",
    );
  });

  it.each(HOSTILE_ORIGINS)("rejects the remembered origin %j", (origin) => {
    localStorage.setItem(REMEMBERED_ORIGIN_KEY, origin);

    expect(resolve("")).toBe("https://app.ever.team");
  });

  it("accepts http on localhost in development only", () => {
    const search = boardSearch("http://localhost:3030");

    expect(resolve(search, developmentConfig)).toBe("http://localhost:3030");
    localStorage.clear();
    expect(resolve(search, productionConfig)).toBe("https://app.ever.team");
    expect(
      resolve(boardSearch("http://demo.ever.team"), developmentConfig),
    ).toBe("https://app.ever.team");
    expect(
      resolve(boardSearch("http://localhost:4000"), developmentConfig),
    ).toBe("https://app.ever.team");
  });

  it("still works when storage is unavailable", () => {
    const blockedStorage = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };

    expect(
      resolveEverTeamsOrigin(
        boardSearch("https://demo.ever.team"),
        blockedStorage,
        productionConfig,
      ),
    ).toBe("https://demo.ever.team");
    expect(resolveEverTeamsOrigin("", blockedStorage, productionConfig)).toBe(
      "https://app.ever.team",
    );
    expect(resolveEverTeamsOrigin("", null, productionConfig)).toBe(
      "https://app.ever.team",
    );
  });

  it("has no origin when no valid origin is configured", () => {
    expect(
      resolve(
        boardSearch("https://demo.ever.team"),
        getEverTeamsOriginConfig(undefined, undefined, false),
      ),
    ).toBeNull();
  });
});

describe("everTeamsOriginAtom", () => {
  const visitBoard = (search: string) => {
    window.history.replaceState(null, "", `/${search}`);
  };

  beforeEach(() => {
    vi.stubEnv("VITE_APP_EVER_TEAMS_URL", EVER_TEAMS_URL);
    vi.stubEnv("VITE_APP_EVER_TEAMS_ORIGINS", EVER_TEAMS_ORIGINS);
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    localStorage.clear();
    visitBoard("");
  });

  it("holds the Ever Teams origin chosen for the visit", () => {
    visitBoard(boardSearch("https://demo.ever.team"));

    expect(unstable_createStore().get(everTeamsOriginAtom)).toBe(
      "https://demo.ever.team",
    );
  });

  it("never holds an origin that is not allowed", () => {
    visitBoard(boardSearch("https://evil.example"));

    expect(unstable_createStore().get(everTeamsOriginAtom)).toBe(
      "https://app.ever.team",
    );
  });

  it("is chosen once per store, so later address changes do not move it", () => {
    visitBoard(boardSearch("https://demo.ever.team"));
    const store = unstable_createStore();
    expect(store.get(everTeamsOriginAtom)).toBe("https://demo.ever.team");

    // the app rewrites the address, and another tab remembers stage
    visitBoard("");
    localStorage.setItem(REMEMBERED_ORIGIN_KEY, "https://stage.ever.team");

    expect(store.get(everTeamsOriginAtom)).toBe("https://demo.ever.team");
    expect(unstable_createStore().get(everTeamsOriginAtom)).toBe(
      "https://stage.ever.team",
    );
  });
});

describe("withEverTeamsOrigin", () => {
  it("adds the origin to a room link, before the room hash", () => {
    expect(
      withEverTeamsOrigin(
        "https://board.ever.team/#room=room-id,room-key",
        "https://demo.ever.team",
      ),
    ).toBe(
      "https://board.ever.team/?origin=https%3A%2F%2Fdemo.ever.team#room=room-id,room-key",
    );
  });

  it("replaces an origin the address already carries and keeps the rest", () => {
    expect(
      withEverTeamsOrigin(
        "https://board.ever.team/?live=true&origin=https%3A%2F%2Fevil.example#json=scene-id,scene-key",
        "https://stage.ever.team",
      ),
    ).toBe(
      "https://board.ever.team/?live=true&origin=https%3A%2F%2Fstage.ever.team#json=scene-id,scene-key",
    );
  });

  it("removes the origin parameter when the visit has no origin", () => {
    expect(
      withEverTeamsOrigin(
        "https://board.ever.team/?origin=https%3A%2F%2Fevil.example&live=true#room=room-id,room-key",
        null,
      ),
    ).toBe("https://board.ever.team/?live=true#room=room-id,room-key");
    expect(
      withEverTeamsOrigin(
        "https://board.ever.team/#room=room-id,room-key",
        null,
      ),
    ).toBe("https://board.ever.team/#room=room-id,room-key");
  });
});
