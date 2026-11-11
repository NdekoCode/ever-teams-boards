import { webcrypto } from "crypto";
import { vi } from "vitest";
import { appJotaiStore } from "../app-jotai";
import {
  everTeamsOriginAtom,
  toShareableBoardUrl,
} from "../auth/everTeamsOrigin";
import { exportToBackend, getCollaborationLink } from "../data";

vi.mock("../data/firebase.ts", () => ({
  saveFilesToFirebase: async () => ({
    savedFiles: new Map(),
    erroredFiles: new Map(),
  }),
}));

const DEMO_ORIGIN = "https://demo.ever.team";
const ORIGIN_PARAM = `origin=${encodeURIComponent(DEMO_ORIGIN)}`;

describe("shareable Board addresses", () => {
  beforeAll(() => {
    vi.stubEnv("VITE_APP_EVER_TEAMS_URL", "https://app.ever.team");
    vi.stubEnv(
      "VITE_APP_EVER_TEAMS_ORIGINS",
      `https://app.ever.team,${DEMO_ORIGIN}`,
    );
    localStorage.clear();
    // the person came from demo.ever.team, and the Authenticator reads the
    // origin of the visit first
    window.history.replaceState(null, "", `/?live=true&${ORIGIN_PARAM}`);
    appJotaiStore.get(everTeamsOriginAtom);
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    localStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  it("room links carry the Ever Teams origin of the visit", () => {
    expect(
      getCollaborationLink({ roomId: "room-id", roomKey: "room-key" }),
    ).toBe(`${window.location.origin}/?${ORIGIN_PARAM}#room=room-id,room-key`);
  });

  it("room links keep it once the app has rewritten the address", () => {
    window.history.replaceState(null, "", "/");

    expect(
      getCollaborationLink({ roomId: "room-id", roomKey: "room-key" }),
    ).toBe(`${window.location.origin}/?${ORIGIN_PARAM}#room=room-id,room-key`);
  });

  it("an origin copied from the current address is replaced", () => {
    // the share dialog of a joined room starts from the current address
    const joinedRoom = `${window.location.origin}/?origin=${encodeURIComponent(
      "https://evil.example",
    )}#room=room-id,room-key`;

    expect(toShareableBoardUrl(joinedRoom)).toBe(
      `${window.location.origin}/?${ORIGIN_PARAM}#room=room-id,room-key`,
    );
  });

  it("scene links carry the Ever Teams origin of the visit", async () => {
    window.history.replaceState(null, "", "/");
    // the scene is encrypted with Web Crypto, which jsdom does not provide
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ json: async () => ({ id: "scene-id" }) })),
    );

    const { url } = await exportToBackend([], {}, {});
    const [address, sceneKey] = (url ?? "").split("#json=scene-id,");

    expect(address).toBe(`${window.location.origin}/?${ORIGIN_PARAM}`);
    expect(sceneKey).toBeTruthy();
  });
});
