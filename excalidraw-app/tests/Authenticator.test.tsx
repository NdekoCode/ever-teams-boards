import { Provider, useAtomValue } from "jotai";
import { vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { STORAGE_KEYS } from "../app_constants";
import { Authenticator, authUserAtom } from "../auth";

const APP_ORIGIN = "https://app.ever.team";
const DEMO_ORIGIN = "https://demo.ever.team";
const GAUZY_API_URL = "https://api.gauzy.test/api";

const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>();

const jsonResponse = (status: number, body?: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);

const SignedInUser = () => {
  const user = useAtomValue(authUserAtom);
  return (
    <div data-testid="signed-in-user">
      {user && `${user.name} ${user.imageUrl}`}
    </div>
  );
};

const renderBoard = () =>
  render(
    <Provider>
      <Authenticator>
        <SignedInUser />
      </Authenticator>
    </Provider>,
  );

const visitBoard = (search: string) => {
  window.history.replaceState(null, "", `/${search}`);
};

const setCookie = (name: string, value: string) => {
  document.cookie = `${name}=${value}; path=/`;
};

const clearCookies = () => {
  for (const cookie of document.cookie.split("; ").filter(Boolean)) {
    document.cookie = `${
      cookie.split("=")[0]
    }=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
};

const loginUrl = (origin: string) =>
  `${origin}/auth/passcode?redirect=${encodeURIComponent(
    window.location.href,
  )}`;

describe("Authenticator", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_APP_EVER_TEAMS_URL", APP_ORIGIN);
    vi.stubEnv("VITE_APP_EVER_TEAMS_ORIGINS", `${APP_ORIGIN},${DEMO_ORIGIN}`);
    vi.stubEnv("VITE_APP_GAUZY_API_URL", GAUZY_API_URL);
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    localStorage.clear();
    visitBoard(`?live=true&origin=${encodeURIComponent(DEMO_ORIGIN)}`);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    clearCookies();
    visitBoard("");
  });

  it("shows the loading state while the session is checked", () => {
    fetchMock.mockReturnValue(new Promise<Response>(() => {}));

    renderBoard();

    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(screen.queryByText("Access denied")).toBeNull();
  });

  it("signs in with the session of the Ever Teams origin the person came from", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        id: "user-1",
        name: "Ada Lovelace",
        imageUrl: "https://cdn.example/ada.png",
      }),
    );

    renderBoard();

    expect(await screen.findByTestId("signed-in-user")).toHaveTextContent(
      "Ada Lovelace https://cdn.example/ada.png",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(`${DEMO_ORIGIN}/api/board/session`, {
      credentials: "include",
    });
    expect(
      localStorage.getItem(STORAGE_KEYS.LOCAL_STORAGE_EVER_TEAMS_ORIGIN),
    ).toBe(DEMO_ORIGIN);
    // the Ever Teams logo leads back to that deployment
    expect(screen.getByRole("link")).toHaveAttribute("href", DEMO_ORIGIN);
  });

  it("links the logo to the default origin when the visit names one that is not allowed", async () => {
    visitBoard(`?origin=${encodeURIComponent("https://evil.example")}`);
    fetchMock.mockResolvedValue(
      jsonResponse(200, { id: "user-1", name: "Ada Lovelace" }),
    );

    renderBoard();

    await screen.findByTestId("signed-in-user");
    expect(screen.getByRole("link")).toHaveAttribute("href", APP_ORIGIN);
  });

  it("leaves the logo without a link when no Ever Teams origin is configured", async () => {
    vi.stubEnv("VITE_APP_EVER_TEAMS_URL", "");
    vi.stubEnv("VITE_APP_EVER_TEAMS_ORIGINS", "");
    setCookie("auth-token", "legacy-token");
    fetchMock.mockResolvedValue(
      jsonResponse(200, { id: "user-1", name: "Ada Lovelace" }),
    );

    renderBoard();

    await screen.findByTestId("signed-in-user");
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("denies access on 401 and links to the sign-in page of that origin", async () => {
    setCookie("auth-token", "legacy-token");
    fetchMock.mockResolvedValue(jsonResponse(401));

    renderBoard();

    expect(await screen.findByText("Access denied")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Login" })).toHaveAttribute(
      "href",
      loginUrl(DEMO_ORIGIN),
    );
    // 401 is an answer: the legacy cookie is not tried
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("signed-in-user")).toBeNull();
  });

  it.each([403, 404, 503])(
    "falls back to the auth-token cookie when the session check answers %i",
    async (status) => {
      setCookie("auth-token", "legacy-token");
      fetchMock
        // an error status is never read as a session, whatever its body
        .mockResolvedValueOnce(
          jsonResponse(status, { id: "user-9", name: "Not a session" }),
        )
        .mockResolvedValueOnce(
          jsonResponse(200, {
            id: "user-2",
            name: "Grace Hopper",
            imageUrl: "https://cdn.example/grace.png",
            email: "grace@example.com",
          }),
        );

      renderBoard();

      expect(await screen.findByTestId("signed-in-user")).toHaveTextContent(
        "Grace Hopper https://cdn.example/grace.png",
      );
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock).toHaveBeenNthCalledWith(2, `${GAUZY_API_URL}/user/me`, {
        headers: { Authorization: "Bearer legacy-token" },
      });
    },
  );

  it("denies access when the legacy check is rejected too", async () => {
    setCookie("auth-token", "expired-token");
    fetchMock
      .mockResolvedValueOnce(jsonResponse(404))
      // the status is checked, not only the shape of the body
      .mockResolvedValueOnce(
        jsonResponse(401, { id: "user-2", name: "Grace Hopper" }),
      );

    renderBoard();

    expect(await screen.findByText("Access denied")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Login" })).toHaveAttribute(
      "href",
      loginUrl(DEMO_ORIGIN),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to the auth-token cookie on a network or CORS failure", async () => {
    setCookie("auth-token_totalChunks", "2");
    setCookie("auth-token0", "split-");
    setCookie("auth-token1", "token");
    fetchMock
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(
        jsonResponse(200, { id: "user-3", name: "Alan Turing" }),
      );

    renderBoard();

    expect(await screen.findByTestId("signed-in-user")).toHaveTextContent(
      "Alan Turing",
    );
    expect(fetchMock).toHaveBeenNthCalledWith(2, `${GAUZY_API_URL}/user/me`, {
      headers: { Authorization: "Bearer split-token" },
    });
  });

  it("denies access on a network failure when there is no auth-token cookie", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    renderBoard();

    expect(await screen.findByText("Access denied")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Login" })).toHaveAttribute(
      "href",
      loginUrl(DEMO_ORIGIN),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses the default origin when the visit names an origin that is not allowed", async () => {
    visitBoard(`?origin=${encodeURIComponent("https://evil.example")}`);
    fetchMock.mockResolvedValue(jsonResponse(401));

    renderBoard();

    expect(await screen.findByRole("link", { name: "Login" })).toHaveAttribute(
      "href",
      loginUrl(APP_ORIGIN),
    );
    expect(fetchMock).toHaveBeenCalledWith(`${APP_ORIGIN}/api/board/session`, {
      credentials: "include",
    });
  });

  it("uses the remembered origin when the visit names none", async () => {
    localStorage.setItem(
      STORAGE_KEYS.LOCAL_STORAGE_EVER_TEAMS_ORIGIN,
      DEMO_ORIGIN,
    );
    visitBoard("");
    fetchMock.mockResolvedValue(jsonResponse(401));

    renderBoard();

    expect(await screen.findByRole("link", { name: "Login" })).toHaveAttribute(
      "href",
      loginUrl(DEMO_ORIGIN),
    );
    expect(fetchMock).toHaveBeenCalledWith(`${DEMO_ORIGIN}/api/board/session`, {
      credentials: "include",
    });
  });

  it("only tries the auth-token cookie when no Ever Teams origin is configured", async () => {
    vi.stubEnv("VITE_APP_EVER_TEAMS_URL", "");
    vi.stubEnv("VITE_APP_EVER_TEAMS_ORIGINS", "");

    renderBoard();

    expect(await screen.findByText("Access denied")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Login" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
