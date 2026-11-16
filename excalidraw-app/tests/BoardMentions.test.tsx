import { vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  EditorJotaiProvider,
  editorJotaiStore,
} from "@excalidraw/excalidraw/editor-jotai";
import { newElementWith } from "@excalidraw/element";
import { newTextElement } from "@excalidraw/element";

import type { ExcalidrawTextElement } from "@excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { BoardMentions } from "../notify/BoardMentions";

import type { BoardMember } from "../notify/boardNotify";

const DEMO_ORIGIN = "https://demo.ever.team";
const ROOM_ID = "8f2b4c6d1e3a5b7c9d0e";
const KEY = "sTdLvMC_M3V8_vGa3UVRDg";

const ADA: BoardMember = {
  employeeId: "0b1c9a4e-2f3d-4c5b-8a7e-6d5c4b3a2f10",
  name: "Ada Lovelace",
  imageUrl: null,
};
const ADELAIDE: BoardMember = {
  employeeId: "5c4b3a2f-1e0d-4c9b-8a7f-6e5d4c3b2a19",
  name: "Adélaïde Martin",
  imageUrl: null,
};
const GRACE: BoardMember = {
  employeeId: "7e6d5c4b-3a2f-4e1d-9c8b-7a6f5e4d3c21",
  name: "Grace Hopper",
  imageUrl: null,
};

const fetchMock = vi.fn<typeof fetch>();

const jsonResponse = (status: number, body?: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);

const routeEverTeams = ({
  members = jsonResponse(200, { items: [ADA, ADELAIDE, GRACE] }),
  notify = jsonResponse(201, { notified: 1 }),
}: { members?: Response; notify?: Response } = {}) => {
  fetchMock.mockImplementation((input) => {
    const url = String(input);
    if (url === `${DEMO_ORIGIN}/api/board/members`) {
      return Promise.resolve(members);
    }
    if (url === `${DEMO_ORIGIN}/api/board/notify`) {
      return Promise.resolve(notify);
    }
    return Promise.reject(new Error(`unexpected request to ${url}`));
  });
};

const requestsTo = (path: string) =>
  fetchMock.mock.calls.filter(([url]) => String(url).endsWith(path));

/**
 * Stands in for the editor: a scene with one text element being edited,
 * and Excalidraw's textarea, which saves its text on input like
 * src/element/textWysiwyg.tsx does and goes away once the edit is saved.
 * Like in Excalidraw, the textarea takes the focus before the app state
 * names the element being edited.
 */
const startEditing = async (customData?: Record<string, any>) => {
  let elements: ExcalidrawTextElement[] = [
    newElementWith(newTextElement({ x: 0, y: 0, text: "" }), { customData }),
  ];
  const element = () => elements[0];
  let isEditing = false;
  const saveText = (text: string) => {
    elements = [
      newElementWith(element(), {
        text,
        originalText: text,
        isDeleted: !text.trim(),
      }),
    ];
  };

  const api = {
    getAppState: () => ({
      editingTextElement: isEditing ? element() : null,
      name: "Retro",
    }),
    getSceneElementsIncludingDeleted: () => elements,
    updateScene: vi.fn(({ elements: next }) => {
      elements = next;
    }),
    setToast: vi.fn(),
  };

  render(
    // the editor provides its translations; the Board renders this part in it
    <EditorJotaiProvider store={editorJotaiStore}>
      <BoardMentions
        excalidrawAPI={api as unknown as ExcalidrawImperativeAPI}
        everTeamsOrigin={DEMO_ORIGIN}
      />
    </EditorJotaiProvider>,
  );

  const container = document.createElement("div");
  container.className = "excalidraw-textEditorContainer";
  document.body.appendChild(container);
  const textarea = document.createElement("textarea");
  textarea.classList.add("excalidraw-wysiwyg");
  textarea.dataset.type = "wysiwyg";
  textarea.oninput = () => saveText(textarea.value);
  // the editor submits on Escape and indents on Tab
  const editorKeyDown = vi.fn();
  textarea.onkeydown = editorKeyDown;
  container.appendChild(textarea);
  textarea.focus();
  isEditing = true;
  await act(() => new Promise((resolve) => setTimeout(resolve)));

  /** Types `text` at the end, firing input and keyup like a person. */
  const type = (text: string) => {
    act(() => {
      textarea.value += text;
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      textarea.dispatchEvent(new Event("input"));
      textarea.dispatchEvent(new KeyboardEvent("keyup", { key: text.at(-1) }));
    });
  };
  const press = (key: string) =>
    act(() => {
      fireEvent.keyDown(textarea, { key });
    });
  /** The editor saves the element, then removes its textarea. */
  const save = async () => {
    await act(async () => {
      textarea.remove();
      container.remove();
    });
  };

  return { api, element, textarea, editorKeyDown, type, press, save };
};

const suggestions = () =>
  screen
    .queryAllByRole("option")
    .map((option) => [
      option.textContent,
      option.getAttribute("aria-selected"),
    ]);

describe("BoardMentions", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    window.history.replaceState(null, "", `/#room=${ROOM_ID},${KEY}`);
    routeEverTeams();
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body
      .querySelectorAll(".excalidraw-textEditorContainer")
      .forEach((node) => node.remove());
    window.history.replaceState(null, "", "/");
  });

  it("suggests teammates for @ and letters, and moves with the arrows", async () => {
    const { textarea, editorKeyDown, type, press } = await startEditing();

    type("Hi @Ad");

    expect(
      await screen.findByRole("listbox", { name: "Teammates to mention" }),
    ).toBeInTheDocument();
    expect(suggestions()).toEqual([
      ["ALAda Lovelace", "true"],
      ["AMAdélaïde Martin", "false"],
    ]);
    expect(textarea).toHaveAttribute("aria-expanded", "true");
    expect(textarea).toHaveAttribute(
      "aria-activedescendant",
      screen.getAllByRole("option")[0].id,
    );

    press("ArrowDown");
    expect(suggestions()[1]).toEqual(["AMAdélaïde Martin", "true"]);
    press("ArrowDown");
    expect(suggestions()[0]).toEqual(["ALAda Lovelace", "true"]);
    press("ArrowUp");
    expect(suggestions()[1]).toEqual(["AMAdélaïde Martin", "true"]);
    // the keys of the list do not reach the editor
    expect(editorKeyDown).not.toHaveBeenCalled();
  });

  it("writes the picked name on Enter, records it and notifies once the text is saved", async () => {
    const { api, element, textarea, editorKeyDown, type, press, save } =
      await startEditing({ color: "blue" });
    type("Hi @Ad");
    await screen.findByRole("listbox");
    press("ArrowDown");

    press("Enter");

    expect(textarea.value).toBe("Hi @Adélaïde Martin ");
    expect(textarea.selectionStart).toBe(textarea.value.length);
    // the editor got the new text through its input handler
    expect(element().originalText).toBe("Hi @Adélaïde Martin ");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(editorKeyDown).not.toHaveBeenCalled();

    type("please review");
    // nothing is sent while typing
    expect(requestsTo("/notify")).toHaveLength(0);

    await save();

    await waitFor(() => expect(requestsTo("/notify")).toHaveLength(1));
    expect(JSON.parse(requestsTo("/notify")[0][1]!.body as string)).toEqual({
      kind: "mention",
      receiverEmployeeIds: [ADELAIDE.employeeId],
      roomId: ROOM_ID,
      boardName: "Retro",
      // the Board address with the Ever Teams origin, without the key
      link: `${window.location.origin}/?origin=${encodeURIComponent(
        DEMO_ORIGIN,
      )}`,
    });
    expect(element().customData).toEqual({
      color: "blue",
      mentions: [ADELAIDE.employeeId],
    });
    expect(api.updateScene).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(api.setToast).toHaveBeenCalledWith({
        message: "Notified 1 teammate you mentioned",
      }),
    );
  });

  it("picks with Tab and with the mouse, keeping the focus in the editor", async () => {
    const { textarea, editorKeyDown, type, press } = await startEditing();
    type("@gr");
    await screen.findByRole("listbox");

    press("Tab");
    expect(textarea.value).toBe("@Grace Hopper ");
    expect(editorKeyDown).not.toHaveBeenCalled();

    type("and @lov");
    const option = await screen.findByRole("option", { name: /Ada Lovelace/ });
    // the mouse does not take the focus away from the editor
    expect(fireEvent.mouseDown(option)).toBe(false);
    fireEvent.click(option);
    expect(textarea.value).toBe("@Grace Hopper and @Ada Lovelace ");
  });

  it("closes on Escape without ending the edit, until another @ is typed", async () => {
    const { editorKeyDown, type, press } = await startEditing();
    type("@Ad");
    await screen.findByRole("listbox");

    press("Escape");

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(editorKeyDown).not.toHaveBeenCalled();
    type("a");
    expect(screen.queryByRole("listbox")).toBeNull();

    type(" @Gr");
    expect(await screen.findByRole("listbox")).toBeInTheDocument();
  });

  it("notifies only the teammates newly mentioned whose name is still in the text", async () => {
    const { api, element, textarea, type, press, save } = await startEditing({
      mentions: [ADA.employeeId],
    });
    // Ada, mentioned before this edit, is picked again
    type("@Ada Lo");
    await screen.findByRole("listbox");
    press("Enter");
    type("and @Gr");
    await screen.findByRole("listbox");
    press("Enter");
    type("and @Ad");
    await screen.findByRole("listbox");
    press("ArrowDown");
    press("Enter");
    expect(element().originalText).toBe(
      "@Ada Lovelace and @Grace Hopper and @Adélaïde Martin ",
    );
    // Adélaïde is removed again before saving
    act(() => {
      textarea.value = "@Ada Lovelace and @Grace Hopper";
      textarea.dispatchEvent(new Event("input"));
    });

    await save();

    await waitFor(() => expect(requestsTo("/notify")).toHaveLength(1));
    expect(
      JSON.parse(requestsTo("/notify")[0][1]!.body as string)
        .receiverEmployeeIds,
    ).toEqual([GRACE.employeeId]);
    expect(element().customData).toEqual({
      mentions: [ADA.employeeId, GRACE.employeeId],
    });
    expect(api.updateScene).toHaveBeenCalledTimes(1);
  });

  it("sends nothing when the picked name was removed before saving", async () => {
    const { api, textarea, type, press, save } = await startEditing();
    type("@Gr");
    await screen.findByRole("listbox");
    press("Enter");
    act(() => {
      textarea.value = "never mind";
      textarea.dispatchEvent(new Event("input"));
    });

    await save();

    await act(async () => {});
    expect(requestsTo("/notify")).toHaveLength(0);
    expect(api.updateScene).not.toHaveBeenCalled();
  });

  it("sends nothing when the text is deleted", async () => {
    const { api, textarea, type, press, save } = await startEditing();
    type("@Gr");
    await screen.findByRole("listbox");
    press("Enter");
    act(() => {
      textarea.value = "   ";
      textarea.dispatchEvent(new Event("input"));
    });

    await save();

    await act(async () => {});
    expect(requestsTo("/notify")).toHaveLength(0);
    expect(api.updateScene).not.toHaveBeenCalled();
  });

  it("tells when the mentioned teammates were not notified, without retrying", async () => {
    routeEverTeams({ notify: jsonResponse(429) });
    const { api, type, press, save } = await startEditing();
    type("@Gr");
    await screen.findByRole("listbox");
    press("Enter");

    await save();

    await waitFor(() =>
      expect(api.setToast).toHaveBeenCalledWith({
        message:
          "The teammates you mentioned were not notified. Too many notifications in a short time. Try again in a minute.",
      }),
    );
    expect(requestsTo("/notify")).toHaveLength(1);
  });

  it("lets @ be plain text when the teammates cannot be loaded", async () => {
    routeEverTeams({ members: jsonResponse(503) });
    const { textarea, editorKeyDown, type, press } = await startEditing();

    type("@Gr");
    await act(async () => {});
    press("Enter");

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(requestsTo("/members")).toHaveLength(1);
    // Enter reaches the editor, which starts a new line
    expect(editorKeyDown).toHaveBeenCalledTimes(1);
    expect(textarea.value).toBe("@Gr");
  });

  it("offers no mentions outside a live collaboration room", async () => {
    window.history.replaceState(null, "", "/");
    const { editorKeyDown, type, press } = await startEditing();

    type("@Gr");
    await act(async () => {});
    press("Enter");

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(editorKeyDown).toHaveBeenCalledTimes(1);
  });
});
