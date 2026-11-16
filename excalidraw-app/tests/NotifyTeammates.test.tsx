import { vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";

import {
  EditorJotaiProvider,
  editorJotaiStore,
} from "@excalidraw/excalidraw/editor-jotai";

import { Provider } from "../app-jotai";
import { ActiveRoomDialog } from "../share/ShareDialog";

import {
  getMemberImageUrl,
  getMemberInitials,
  searchMembers,
} from "../notify/members";
import { NotifyTeammates } from "../notify/NotifyTeammates";

import type { BoardMember } from "../notify/boardNotify";
import type { CollabAPI } from "../collab/Collab";

const APP_ORIGIN = "https://app.ever.team";
const DEMO_ORIGIN = "https://demo.ever.team";
const BOARD_URL = `https://board.ever.team/?origin=${encodeURIComponent(
  DEMO_ORIGIN,
)}`;
const ROOM_ID = "8f2b4c6d1e3a5b7c9d0e";
const SNAPSHOT_ID = "a1B2c3D4e5F6g7H8i9J0k";
const KEY = "sTdLvMC_M3V8_vGa3UVRDg";
const ROOM_LINK = `${BOARD_URL}#room=${ROOM_ID},${KEY}`;
const SNAPSHOT_LINK = `${BOARD_URL}#json=${SNAPSHOT_ID},${KEY}`;

const ADA: BoardMember = {
  employeeId: "0b1c9a4e-2f3d-4c5b-8a7e-6d5c4b3a2f10",
  name: "Ada Lovelace",
  imageUrl: "https://cdn.example/ada.png",
};
const GRACE: BoardMember = {
  employeeId: "7e6d5c4b-3a2f-4e1d-9c8b-7a6f5e4d3c21",
  name: "Grace Hopper",
  imageUrl: null,
};
const ADELAIDE: BoardMember = {
  employeeId: "5c4b3a2f-1e0d-4c9b-8a7f-6e5d4c3b2a19",
  name: "Adélaïde Martin",
  // eslint-disable-next-line no-script-url
  imageUrl: "javascript:alert(1)",
};
const MEMBERS = [ADA, ADELAIDE, GRACE];

const fetchMock = vi.fn<typeof fetch>();

const jsonResponse = (status: number, body?: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);

/** Answers the Ever Teams routes; `notify` answers POST /api/board/notify. */
const routeEverTeams = ({
  members = jsonResponse(200, { items: MEMBERS }),
  notify = () => Promise.resolve(jsonResponse(201, { notified: 2 })),
}: {
  members?: Response;
  notify?: () => Promise<Response>;
} = {}) => {
  fetchMock.mockImplementation((input) => {
    const url = String(input);
    if (url === `${DEMO_ORIGIN}/api/board/members`) {
      return Promise.resolve(members);
    }
    if (url === `${DEMO_ORIGIN}/api/board/notify`) {
      return notify();
    }
    return Promise.reject(new Error(`unexpected request to ${url}`));
  });
};

const notifyCalls = () =>
  fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/notify"));

const postedBody = (index = 0) =>
  JSON.parse(notifyCalls()[index][1]!.body as string);

const renderPart = (boardLink = ROOM_LINK, boardName?: string) =>
  render(
    // the editor provides its translations; the Board renders this part in it
    <EditorJotaiProvider store={editorJotaiStore}>
      <Provider>
        <NotifyTeammates boardLink={boardLink} boardName={boardName} />
      </Provider>
    </EditorJotaiProvider>,
  );

const openPart = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Notify teammates" }));
  await screen.findByRole("list", { name: "Teammates" });
};

const notifyButton = () => screen.getByRole("button", { name: "Notify" });

describe("NotifyTeammates", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_APP_EVER_TEAMS_URL", APP_ORIGIN);
    vi.stubEnv("VITE_APP_EVER_TEAMS_ORIGINS", `${APP_ORIGIN},${DEMO_ORIGIN}`);
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    localStorage.clear();
    window.history.replaceState(
      null,
      "",
      `/?origin=${encodeURIComponent(DEMO_ORIGIN)}`,
    );
    routeEverTeams();
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  it("is hidden when the visit has no Ever Teams origin", () => {
    vi.stubEnv("VITE_APP_EVER_TEAMS_URL", "");
    vi.stubEnv("VITE_APP_EVER_TEAMS_ORIGINS", "");

    renderPart();

    expect(screen.queryByRole("button", { name: "Notify teammates" })).toBe(
      null,
    );
  });

  it("is hidden for a link that opens no room or snapshot", () => {
    renderPart(BOARD_URL);

    expect(screen.queryByRole("button", { name: "Notify teammates" })).toBe(
      null,
    );
  });

  it("loads the teammates only once the part opens", async () => {
    renderPart();
    const toggle = screen.getByRole("button", { name: "Notify teammates" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(fetchMock).not.toHaveBeenCalled();

    await openPart();

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(`${DEMO_ORIGIN}/api/board/members`, {
      credentials: "include",
    });
    const list = screen.getByRole("list", { name: "Teammates" });
    expect(
      within(list)
        .getAllByRole("checkbox")
        .map((checkbox) => checkbox.closest("label")!.textContent),
    ).toEqual(["Ada Lovelace", "AMAdélaïde Martin", "GHGrace Hopper"]);
  });

  it("shows pictures, and initials when there is no usable picture", async () => {
    renderPart();
    await openPart();

    const label = (name: string) =>
      screen
        .getByRole("checkbox", { name: new RegExp(name) })
        .closest("label")!;
    expect(label("Ada").querySelector("img")).toHaveAttribute(
      "src",
      ADA.imageUrl,
    );
    expect(label("Grace").querySelector("img")).toBeNull();
    expect(label("Grace")).toHaveTextContent("GH");
    // a picture address that is not http(s) is never used
    expect(label("Adélaïde").querySelector("img")).toBeNull();
  });

  it("finds teammates by any word of their name, ignoring accents and case", async () => {
    renderPart();
    await openPart();
    const search = screen.getByRole("textbox", { name: "Search teammates" });
    const names = () =>
      screen
        .queryAllByRole("checkbox", { name: /./ })
        .filter((checkbox) => checkbox.closest("ul"))
        .map((checkbox) => checkbox.closest("label")!.textContent);

    fireEvent.change(search, { target: { value: "ADE" } });
    expect(names()).toEqual(["AMAdélaïde Martin"]);

    fireEvent.change(search, { target: { value: "hop" } });
    expect(names()).toEqual(["GHGrace Hopper"]);

    fireEvent.change(search, { target: { value: "zed" } });
    expect(names()).toEqual([]);
    expect(screen.getByText('No teammate matches "zed".')).toBeInTheDocument();
  });

  it("sends one request on Notify, never while picking, without the key by default", async () => {
    renderPart(ROOM_LINK, "Sprint planning");
    await openPart();
    expect(notifyButton()).toBeDisabled();
    expect(
      screen.getByRole("checkbox", {
        name: "Include the link so they can open it directly",
      }),
    ).not.toBeChecked();

    fireEvent.click(screen.getByRole("checkbox", { name: /Grace Hopper/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Ada Lovelace/ }));
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    expect(notifyCalls()).toHaveLength(0);

    fireEvent.click(notifyButton());

    expect(await screen.findByText("Notified 2 teammates")).toBeInTheDocument();
    expect(notifyCalls()).toHaveLength(1);
    expect(notifyCalls()[0][1]).toMatchObject({
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    expect(postedBody()).toEqual({
      kind: "share",
      receiverEmployeeIds: [GRACE.employeeId, ADA.employeeId],
      roomId: ROOM_ID,
      boardName: "Sprint planning",
      link: BOARD_URL,
    });
    // the selection is cleared so that a second click sends nothing again
    expect(
      screen.getByRole("checkbox", { name: /Grace Hopper/ }),
    ).not.toBeChecked();
    expect(notifyButton()).toBeDisabled();
    // the focus stays in the dialog, on the outcome next to the button
    expect(screen.getByText("Notified 2 teammates")).toHaveFocus();
  });

  it("sends the link with its key when the person asks for it", async () => {
    renderPart();
    await openPart();

    fireEvent.click(screen.getByRole("checkbox", { name: /Ada Lovelace/ }));
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Include the link so they can open it directly",
      }),
    );
    fireEvent.click(notifyButton());

    await screen.findByText("Notified 2 teammates");
    expect(postedBody()).toEqual({
      kind: "share",
      receiverEmployeeIds: [ADA.employeeId],
      roomId: ROOM_ID,
      link: ROOM_LINK,
    });
  });

  it("names the snapshot of an exported link", async () => {
    routeEverTeams({
      notify: () => Promise.resolve(jsonResponse(201, { notified: 1 })),
    });
    renderPart(SNAPSHOT_LINK);
    await openPart();

    fireEvent.click(screen.getByRole("checkbox", { name: /Ada Lovelace/ }));
    fireEvent.click(notifyButton());

    expect(await screen.findByText("Notified 1 teammate")).toBeInTheDocument();
    expect(postedBody()).toEqual({
      kind: "share",
      receiverEmployeeIds: [ADA.employeeId],
      snapshotId: SNAPSHOT_ID,
      link: BOARD_URL,
    });
  });

  it("disables Notify while the request is on its way", async () => {
    let answer: (response: Response) => void = () => {};
    routeEverTeams({
      notify: () =>
        new Promise<Response>((resolve) => {
          answer = resolve;
        }),
    });
    renderPart();
    await openPart();
    fireEvent.click(screen.getByRole("checkbox", { name: /Ada Lovelace/ }));

    fireEvent.click(notifyButton());

    const sending = screen.getByRole("button", { name: "Notifying…" });
    expect(sending).toBeDisabled();
    fireEvent.click(sending);
    expect(notifyCalls()).toHaveLength(1);

    await act(async () => {
      answer(jsonResponse(201, { notified: 1 }));
    });
    expect(screen.getByText("Notified 1 teammate")).toBeInTheDocument();
  });

  it.each([
    [
      401,
      "Your Ever Teams session has ended. Sign in again, then try once more.",
    ],
    [403, "You are not allowed to notify these teammates."],
    [429, "Too many notifications in a short time. Try again in a minute."],
    [503, "Ever Teams cannot send notifications right now. Try again later."],
    [400, "Could not notify your teammates."],
  ])("explains a %s answer and does not retry", async (status, message) => {
    routeEverTeams({
      notify: () => Promise.resolve(jsonResponse(status, { message: [] })),
    });
    renderPart();
    await openPart();
    fireEvent.click(screen.getByRole("checkbox", { name: /Ada Lovelace/ }));

    fireEvent.click(notifyButton());

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(notifyCalls()).toHaveLength(1);
    // the selection stays, so that the person can decide to try again
    expect(
      screen.getByRole("checkbox", { name: /Ada Lovelace/ }),
    ).toBeChecked();
    expect(notifyButton()).toBeEnabled();
  });

  it("offers to sign in again in a new tab after a 401", async () => {
    routeEverTeams({
      notify: () => Promise.resolve(jsonResponse(401)),
    });
    renderPart();
    await openPart();
    fireEvent.click(screen.getByRole("checkbox", { name: /Ada Lovelace/ }));

    fireEvent.click(notifyButton());

    const signIn = await screen.findByRole("link", { name: "Sign in again" });
    expect(signIn).toHaveAttribute("href", `${DEMO_ORIGIN}/auth/passcode`);
    expect(signIn).toHaveAttribute("target", "_blank");
  });

  it("explains why the teammates could not be loaded and lets the person try again", async () => {
    routeEverTeams({ members: jsonResponse(503) });
    renderPart();

    fireEvent.click(screen.getByRole("button", { name: "Notify teammates" }));

    expect(
      await screen.findByText(
        "Ever Teams cannot send notifications right now. Try again later.",
      ),
    ).toBeInTheDocument();
    expect(notifyButton()).toBeDisabled();

    routeEverTeams();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await screen.findByRole("list", { name: "Teammates" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("offers to sign in again when the teammates answer 401, then to try again", async () => {
    routeEverTeams({ members: jsonResponse(401) });
    renderPart();

    fireEvent.click(screen.getByRole("button", { name: "Notify teammates" }));

    expect(
      await screen.findByRole("link", { name: "Sign in again" }),
    ).toHaveAttribute("href", `${DEMO_ORIGIN}/auth/passcode`);

    // signed in again in the other tab
    routeEverTeams();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await screen.findByRole("list", { name: "Teammates" });
  });

  it("does not offer to try again when loading the teammates is not allowed", async () => {
    routeEverTeams({ members: jsonResponse(403) });
    renderPart();

    fireEvent.click(screen.getByRole("button", { name: "Notify teammates" }));

    expect(
      await screen.findByText("You are not allowed to notify these teammates."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("lets the person pick up to 50 teammates", async () => {
    const team = Array.from({ length: 51 }, (_, index) => ({
      employeeId: `employee-${String(index).padStart(2, "0")}`,
      name: `Teammate ${String(index).padStart(2, "0")}`,
      imageUrl: null,
    }));
    routeEverTeams({ members: jsonResponse(200, { items: team }) });
    renderPart();
    await openPart();

    const checkboxes = within(
      screen.getByRole("list", { name: "Teammates" }),
    ).getAllByRole("checkbox");
    checkboxes.slice(0, 50).forEach((checkbox) => fireEvent.click(checkbox));

    expect(checkboxes[50]).toBeDisabled();
    expect(
      screen.getByText(/You can notify up to 50 teammates at once/),
    ).toBeInTheDocument();

    fireEvent.click(notifyButton());
    await screen.findByText("Notified 2 teammates");
    expect(postedBody().receiverEmployeeIds).toHaveLength(50);
  });

  it("keeps the canvas shortcuts away from its controls, but lets Escape through", async () => {
    const onDocumentKeyDown = vi.fn();
    document.addEventListener("keydown", onDocumentKeyDown);
    try {
      renderPart();
      await openPart();
      const checkbox = screen.getByRole("checkbox", { name: /Ada Lovelace/ });

      fireEvent.keyDown(checkbox, { key: "r" });
      fireEvent.keyDown(checkbox, { key: " " });
      expect(onDocumentKeyDown).not.toHaveBeenCalled();

      fireEvent.keyDown(checkbox, { key: "Escape" });
      expect(onDocumentKeyDown).toHaveBeenCalledTimes(1);
    } finally {
      document.removeEventListener("keydown", onDocumentKeyDown);
    }
  });
});

describe("the live collaboration dialog", () => {
  const collabAPI = {
    getUsername: () => "Ada",
    setUsername: () => {},
    setCollabError: () => {},
    stopCollaboration: () => {},
    isCollaborating: () => true,
  } as unknown as CollabAPI;

  const renderRoomModal = (activeRoomLink: string) =>
    render(
      <EditorJotaiProvider store={editorJotaiStore}>
        <Provider>
          <ActiveRoomDialog
            collabAPI={collabAPI}
            activeRoomLink={activeRoomLink}
            boardName="Retro"
            handleClose={() => {}}
          />
        </Provider>
      </EditorJotaiProvider>,
    );

  beforeEach(() => {
    vi.stubEnv("VITE_APP_EVER_TEAMS_URL", APP_ORIGIN);
    vi.stubEnv("VITE_APP_EVER_TEAMS_ORIGINS", APP_ORIGIN);
    vi.stubGlobal("fetch", fetchMock);
    localStorage.clear();
    fetchMock.mockResolvedValue(jsonResponse(201, { notified: 1 }));
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("offers to notify teammates about the active room", async () => {
    fetchMock.mockImplementation((input) =>
      Promise.resolve(
        String(input).endsWith("/members")
          ? jsonResponse(200, { items: [ADA] })
          : jsonResponse(201, { notified: 1 }),
      ),
    );
    renderRoomModal(ROOM_LINK);

    await openPart();
    fireEvent.click(screen.getByRole("checkbox", { name: /Ada Lovelace/ }));
    fireEvent.click(notifyButton());

    await screen.findByText("Notified 1 teammate");
    expect(notifyCalls()[0][0]).toBe(`${APP_ORIGIN}/api/board/notify`);
    expect(postedBody()).toEqual({
      kind: "share",
      receiverEmployeeIds: [ADA.employeeId],
      roomId: ROOM_ID,
      boardName: "Retro",
      link: BOARD_URL,
    });
  });
});

describe("teammate search", () => {
  const LOVELACE_FIRST = [
    { employeeId: "1", name: "Bob Ada", imageUrl: null },
    { employeeId: "2", name: "Ada Lovelace", imageUrl: null },
    { employeeId: "3", name: "Grace Hopper", imageUrl: null },
  ];

  it("puts the names that start with the query first", () => {
    expect(
      searchMembers(LOVELACE_FIRST, "ada").map(({ name }) => name),
    ).toEqual(["Ada Lovelace", "Bob Ada"]);
  });

  it("keeps everyone for an empty query, up to the limit", () => {
    expect(searchMembers(LOVELACE_FIRST, "  ")).toHaveLength(3);
    expect(searchMembers(LOVELACE_FIRST, "", 2)).toHaveLength(2);
    expect(searchMembers(LOVELACE_FIRST, "a", 1)).toEqual([LOVELACE_FIRST[1]]);
  });

  it("matches several words and words after a hyphen", () => {
    const people = [
      { employeeId: "1", name: "Jean-Luc Picard", imageUrl: null },
      { employeeId: "2", name: "Ada Lovelace", imageUrl: null },
    ];
    expect(searchMembers(people, "luc")).toEqual([people[0]]);
    expect(searchMembers(people, "ada  lov")).toEqual([people[1]]);
    expect(searchMembers(people, "velace")).toEqual([]);
  });

  it("makes up to two initials", () => {
    expect(getMemberInitials("Ada Lovelace")).toBe("AL");
    expect(getMemberInitials("Ada Augusta King Lovelace")).toBe("AL");
    expect(getMemberInitials("grace")).toBe("G");
    expect(getMemberInitials("  ")).toBe("?");
    expect(getMemberInitials("😀 Smile")).toBe("😀S");
  });

  it("uses http(s) pictures only", () => {
    const withImage = (imageUrl: string | null) =>
      getMemberImageUrl({ employeeId: "1", name: "Ada", imageUrl });
    expect(withImage("https://cdn.example/a.png")).toBe(
      "https://cdn.example/a.png",
    );
    expect(withImage("http://localhost:3030/a.png")).toBe(
      "http://localhost:3030/a.png",
    );
    expect(withImage("data:image/png;base64,AAAA")).toBeNull();
    expect(withImage("not a url")).toBeNull();
    expect(withImage(null)).toBeNull();
  });
});
