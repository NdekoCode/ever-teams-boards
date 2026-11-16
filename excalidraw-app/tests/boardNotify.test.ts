import { vi } from "vitest";

import {
  fetchBoardMembers,
  sendBoardNotification,
} from "../notify/boardNotify";
import {
  buildMentionRequest,
  buildShareRequest,
  getBoardLinkTarget,
  MAX_RECEIVERS,
  withoutFragment,
} from "../notify/notifyRequest";
import {
  getNotifiedMessage,
  getNotifyErrorMessage,
} from "../notify/notifyMessages";

import type { BoardNotifyRequest } from "../notify/boardNotify";

const EVER_TEAMS_ORIGIN = "https://demo.ever.team";
const BOARD_URL = `https://board.ever.team/?origin=${encodeURIComponent(
  EVER_TEAMS_ORIGIN,
)}`;
const ROOM_ID = "8f2b4c6d1e3a5b7c9d0e";
const SNAPSHOT_ID = "a1B2c3D4e5F6g7H8i9J0k";
const KEY = "sTdLvMC_M3V8_vGa3UVRDg";
const ROOM_LINK = `${BOARD_URL}#room=${ROOM_ID},${KEY}`;
const SNAPSHOT_LINK = `${BOARD_URL}#json=${SNAPSHOT_ID},${KEY}`;

const ADA = "0b1c9a4e-2f3d-4c5b-8a7e-6d5c4b3a2f10";
const GRACE = "7e6d5c4b-3a2f-4e1d-9c8b-7a6f5e4d3c21";

const fetchMock = vi.fn<typeof fetch>();

const jsonResponse = (status: number, body?: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: () =>
      body === undefined
        ? Promise.reject(new SyntaxError("Unexpected end of JSON input"))
        : Promise.resolve(body),
  } as Response);

describe("Board links", () => {
  it("reads the room id of a live collaboration link, never its key", () => {
    expect(getBoardLinkTarget(ROOM_LINK)).toEqual({ roomId: ROOM_ID });
  });

  it("reads the snapshot id of an exported link, never its key", () => {
    expect(getBoardLinkTarget(SNAPSHOT_LINK)).toEqual({
      snapshotId: SNAPSHOT_ID,
    });
  });

  it.each([
    ["no fragment", BOARD_URL],
    ["a library fragment", `${BOARD_URL}#addLibrary=x&token=y`],
    ["a room without key", `${BOARD_URL}#room=${ROOM_ID}`],
    ["an id with other characters", `${BOARD_URL}#room=a.b/c,${KEY}`],
    [
      "an id longer than 128 characters",
      `${BOARD_URL}#room=${"a".repeat(129)},${KEY}`,
    ],
    ["an external scene", `${BOARD_URL}#url=https://example.com/scene.json`],
    ["not an address", "room=abc,def"],
  ])("finds no room or snapshot in %s", (_, link) => {
    expect(getBoardLinkTarget(link)).toBeNull();
  });

  it("drops the fragment, and the key with it, from a Board link", () => {
    expect(withoutFragment(ROOM_LINK)).toBe(BOARD_URL);
    expect(withoutFragment(SNAPSHOT_LINK)).toBe(BOARD_URL);
    expect(withoutFragment(BOARD_URL)).toBe(BOARD_URL);
  });
});

describe("share request", () => {
  it("names the room and sends the link without its key by default", () => {
    expect(
      buildShareRequest({
        boardLink: ROOM_LINK,
        receiverEmployeeIds: [ADA, GRACE],
        includeKey: false,
        boardName: "Sprint planning",
      }),
    ).toEqual({
      kind: "share",
      receiverEmployeeIds: [ADA, GRACE],
      roomId: ROOM_ID,
      boardName: "Sprint planning",
      link: BOARD_URL,
    });
  });

  it("sends the full link with its key only when asked to", () => {
    const request = buildShareRequest({
      boardLink: ROOM_LINK,
      receiverEmployeeIds: [ADA],
      includeKey: true,
    });
    expect(request?.link).toBe(ROOM_LINK);
  });

  it("names the snapshot of an exported link", () => {
    const request = buildShareRequest({
      boardLink: SNAPSHOT_LINK,
      receiverEmployeeIds: [ADA],
      includeKey: false,
    });
    expect(request).toEqual({
      kind: "share",
      receiverEmployeeIds: [ADA],
      snapshotId: SNAPSHOT_ID,
      link: BOARD_URL,
    });
    expect(request).not.toHaveProperty("roomId");
  });

  it("sends each person once", () => {
    const request = buildShareRequest({
      boardLink: ROOM_LINK,
      receiverEmployeeIds: [ADA, GRACE, ADA, ""],
      includeKey: false,
    });
    expect(request?.receiverEmployeeIds).toEqual([ADA, GRACE]);
  });

  it("builds nothing without anyone to notify, or with too many people", () => {
    expect(
      buildShareRequest({
        boardLink: ROOM_LINK,
        receiverEmployeeIds: [],
        includeKey: false,
      }),
    ).toBeNull();
    const tooMany = Array.from(
      { length: MAX_RECEIVERS + 1 },
      (_, index) => `employee-${index}`,
    );
    expect(
      buildShareRequest({
        boardLink: ROOM_LINK,
        receiverEmployeeIds: tooMany,
        includeKey: false,
      }),
    ).toBeNull();
    expect(
      buildShareRequest({
        boardLink: ROOM_LINK,
        receiverEmployeeIds: tooMany.slice(1),
        includeKey: false,
      })?.receiverEmployeeIds,
    ).toHaveLength(MAX_RECEIVERS);
  });

  it("builds nothing for a link that opens no room or snapshot", () => {
    expect(
      buildShareRequest({
        boardLink: BOARD_URL,
        receiverEmployeeIds: [ADA],
        includeKey: true,
      }),
    ).toBeNull();
  });

  it("trims the Board name, leaves an empty one out and shortens a long one", () => {
    const withName = (boardName: string | null | undefined) =>
      buildShareRequest({
        boardLink: ROOM_LINK,
        receiverEmployeeIds: [ADA],
        includeKey: false,
        boardName,
      });

    expect(withName("  Roadmap  ")?.boardName).toBe("Roadmap");
    expect(withName("   ")).not.toHaveProperty("boardName");
    expect(withName(null)).not.toHaveProperty("boardName");
    expect(withName("x".repeat(250))?.boardName).toBe("x".repeat(200));
    // an emoji is two UTF-16 code units: it is never cut in half
    const emojiName = `${"x".repeat(199)}🎨tail`;
    expect(withName(emojiName)?.boardName).toBe("x".repeat(199));
  });

  it("leaves out a link Ever Teams would turn down", () => {
    const longLink = `${BOARD_URL}&pad=${"p".repeat(
      2048,
    )}#room=${ROOM_ID},${KEY}`;
    const request = buildShareRequest({
      boardLink: longLink,
      receiverEmployeeIds: [ADA],
      includeKey: true,
    });
    expect(request).not.toHaveProperty("link");
    expect(request?.roomId).toBe(ROOM_ID);
  });
});

describe("mention request", () => {
  it("names the room and never sends the key", () => {
    expect(
      buildMentionRequest({
        roomLink: ROOM_LINK,
        receiverEmployeeIds: [GRACE, GRACE],
        boardName: "Retro",
      }),
    ).toEqual({
      kind: "mention",
      receiverEmployeeIds: [GRACE],
      roomId: ROOM_ID,
      boardName: "Retro",
      link: BOARD_URL,
    });
  });

  it("builds nothing outside a live collaboration room", () => {
    expect(
      buildMentionRequest({
        roomLink: SNAPSHOT_LINK,
        receiverEmployeeIds: [ADA],
      }),
    ).toBeNull();
    expect(
      buildMentionRequest({ roomLink: BOARD_URL, receiverEmployeeIds: [ADA] }),
    ).toBeNull();
  });
});

describe("Ever Teams notification routes", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("teammates", () => {
    it("lists the teammates with the session of the Ever Teams origin", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, {
          items: [
            { employeeId: GRACE, name: "Grace Hopper", imageUrl: null },
            {
              employeeId: ADA,
              name: " Ada Lovelace ",
              imageUrl: "https://cdn.example/ada.png",
            },
            // incomplete or repeated entries are left out
            { employeeId: "", name: "Nobody" },
            { employeeId: "no-name", name: "  " },
            { name: "No id" },
            null,
            { employeeId: GRACE, name: "Grace again" },
          ],
        }),
      );

      expect(await fetchBoardMembers(EVER_TEAMS_ORIGIN)).toEqual({
        ok: true,
        members: [
          {
            employeeId: ADA,
            name: "Ada Lovelace",
            imageUrl: "https://cdn.example/ada.png",
          },
          { employeeId: GRACE, name: "Grace Hopper", imageUrl: null },
        ],
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        `${EVER_TEAMS_ORIGIN}/api/board/members`,
        { credentials: "include" },
      );
    });

    it.each([
      [401, "signed-out"],
      [403, "forbidden"],
      [429, "rate-limited"],
      [503, "unavailable"],
      [404, "failed"],
      [500, "failed"],
    ])("tells why the teammates are missing on %s", async (status, error) => {
      fetchMock.mockResolvedValue(jsonResponse(status, {}));

      expect(await fetchBoardMembers(EVER_TEAMS_ORIGIN)).toEqual({
        ok: false,
        error,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("treats a network or CORS failure as Ever Teams being unavailable", async () => {
      fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

      expect(await fetchBoardMembers(EVER_TEAMS_ORIGIN)).toEqual({
        ok: false,
        error: "unavailable",
      });
    });

    it.each([
      ["no body", undefined],
      ["no items", { members: [] }],
      ["items that are not a list", { items: "Ada" }],
    ])("fails on an answer with %s", async (_, body) => {
      fetchMock.mockResolvedValue(jsonResponse(200, body));

      expect(await fetchBoardMembers(EVER_TEAMS_ORIGIN)).toEqual({
        ok: false,
        error: "failed",
      });
    });
  });

  describe("notify", () => {
    const request: BoardNotifyRequest = {
      kind: "share",
      receiverEmployeeIds: [ADA, GRACE],
      roomId: ROOM_ID,
      link: BOARD_URL,
    };

    it("posts the request once, as JSON, with the session of the Ever Teams origin", async () => {
      fetchMock.mockResolvedValue(jsonResponse(201, { notified: 2 }));

      expect(await sendBoardNotification(EVER_TEAMS_ORIGIN, request)).toEqual({
        ok: true,
        notified: 2,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(`${EVER_TEAMS_ORIGIN}/api/board/notify`);
      expect(init).toMatchObject({
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      expect(JSON.parse(init!.body as string)).toEqual(request);
    });

    it("reports the people asked for when the answer cannot be read", async () => {
      fetchMock.mockResolvedValue(jsonResponse(201));

      expect(await sendBoardNotification(EVER_TEAMS_ORIGIN, request)).toEqual({
        ok: true,
        notified: 2,
      });
    });

    it.each([
      [400, "failed"],
      [401, "signed-out"],
      [403, "forbidden"],
      [415, "failed"],
      [429, "rate-limited"],
      [503, "unavailable"],
    ])("never retries after %s", async (status, error) => {
      fetchMock.mockResolvedValue(
        jsonResponse(status, { message: ["receiverEmployeeIds must be"] }),
      );

      expect(await sendBoardNotification(EVER_TEAMS_ORIGIN, request)).toEqual({
        ok: false,
        error,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("treats a network or CORS failure as Ever Teams being unavailable", async () => {
      fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

      expect(await sendBoardNotification(EVER_TEAMS_ORIGIN, request)).toEqual({
        ok: false,
        error: "unavailable",
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});

describe("notification messages", () => {
  it("counts the people notified", () => {
    expect(getNotifiedMessage(1)).toBe("Notified 1 teammate");
    expect(getNotifiedMessage(3)).toBe("Notified 3 teammates");
  });

  it.each([
    ["signed-out", "Sign in again"],
    ["rate-limited", "Try again in a minute"],
    ["forbidden", "not allowed"],
    ["unavailable", "Try again later"],
    ["failed", "Could not notify"],
  ] as const)("explains %s", (error, text) => {
    expect(getNotifyErrorMessage(error)).toContain(text);
  });
});
