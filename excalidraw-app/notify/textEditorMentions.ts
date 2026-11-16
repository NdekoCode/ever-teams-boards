import { KEYS } from "@excalidraw/common";
import { newElementWith } from "@excalidraw/element";
import { isTextElement } from "@excalidraw/element";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { withEverTeamsOrigin } from "../auth/everTeamsOrigin";

import { fetchBoardMembers, sendBoardNotification } from "./boardNotify";
import { searchMembers } from "./members";

import {
  findMentionQuery,
  insertMention,
  isSameMentions,
  readMentions,
  resolveMentions,
  withMentions,
} from "./mentions";
import {
  getMentionNotifiedMessage,
  getMentionErrorMessage,
} from "./notifyMessages";
import {
  buildMentionRequest,
  getBoardLinkTarget,
  MAX_RECEIVERS,
} from "./notifyRequest";

import type { MentionQuery, PickedMention } from "./mentions";
import type { BoardMember } from "./boardNotify";

const MAX_MENTION_SUGGESTIONS = 6;
/** A failed teammates request is made again at a later edit, at most this often. */
const MEMBERS_RETRY_DELAY_MS = 60 * 1000;

export type MentionSuggestions = {
  mention: MentionQuery;
  members: BoardMember[];
  activeIndex: number;
  /** Where the text editor is on screen, to show the list next to it. */
  anchor: { left: number; top: number; bottom: number };
};

type EditSession = {
  textarea: HTMLTextAreaElement;
  elementId: string;
  /** The room link with the Ever Teams origin, fragment included. */
  roomLink: string;
  /** customData.mentions of the element when the edit started. */
  previousMentions: string[];
  picked: PickedMention[];
  /** Start of the "@query" the person closed with Escape. */
  dismissedAt: number | null;
  stop: () => void;
};

/** Excalidraw's text editor, see src/element/textWysiwyg.tsx. */
const isTextEditor = (
  target: EventTarget | null,
): target is HTMLTextAreaElement =>
  target instanceof HTMLTextAreaElement &&
  target.classList.contains("excalidraw-wysiwyg");

/**
 * Mentions in the text editor of a live collaboration room. Typing "@"
 * and letters suggests teammates; picking one writes "@Name " and
 * remembers their employee id. When the edit is saved, the element keeps
 * the ids in customData.mentions and Ever Teams notifies the teammates
 * newly mentioned, with one request carrying the room id, the Board name
 * and the link without its key, never the text.
 *
 * The editor is Excalidraw's own textarea: this attaches to it when it
 * gets the focus and lets it be when there is nothing to suggest, so that
 * typing "@" is plain typing whenever the teammates cannot be loaded.
 */
export const watchTextEditorMentions = ({
  excalidrawAPI,
  everTeamsOrigin,
  listId,
  onSuggestionsChange,
}: {
  excalidrawAPI: ExcalidrawImperativeAPI;
  everTeamsOrigin: string;
  /** id of the suggestion list, for the textarea's ARIA attributes */
  listId: string;
  onSuggestionsChange: (suggestions: MentionSuggestions | null) => void;
}) => {
  let session: EditSession | null = null;
  let suggestions: MentionSuggestions | null = null;
  let members: BoardMember[] | null = null;
  let isLoadingMembers = false;
  let membersFailedAt = -Infinity;
  let isStopped = false;

  const setSuggestions = (next: MentionSuggestions | null) => {
    suggestions = next;
    const textarea = session?.textarea;
    if (textarea) {
      textarea.setAttribute("aria-expanded", String(!!next));
      if (next) {
        textarea.setAttribute("aria-controls", listId);
        textarea.setAttribute(
          "aria-activedescendant",
          `${listId}-${next.activeIndex}`,
        );
      } else {
        textarea.removeAttribute("aria-controls");
        textarea.removeAttribute("aria-activedescendant");
      }
    }
    onSuggestionsChange(next);
  };

  const update = () => {
    if (!session) {
      return;
    }
    const { textarea } = session;
    const mention =
      textarea.selectionStart === textarea.selectionEnd
        ? findMentionQuery(textarea.value, textarea.selectionEnd)
        : null;
    if (!mention) {
      session.dismissedAt = null;
    }
    const found =
      members && mention && mention.start !== session.dismissedAt
        ? searchMembers(members, mention.query, MAX_MENTION_SUGGESTIONS)
        : [];
    if (!mention || !found.length) {
      if (suggestions) {
        setSuggestions(null);
      }
      return;
    }

    const isSameQuery =
      suggestions?.mention.start === mention.start &&
      suggestions.mention.query === mention.query;
    const { left, top, bottom } = textarea.getBoundingClientRect();
    setSuggestions({
      mention,
      members: found,
      activeIndex: isSameQuery
        ? Math.min(suggestions!.activeIndex, found.length - 1)
        : 0,
      anchor: { left, top, bottom },
    });
  };

  const loadMembers = () => {
    if (
      members ||
      isLoadingMembers ||
      Date.now() - membersFailedAt < MEMBERS_RETRY_DELAY_MS
    ) {
      return;
    }
    isLoadingMembers = true;
    fetchBoardMembers(everTeamsOrigin).then((result) => {
      isLoadingMembers = false;
      if (isStopped) {
        return;
      }
      if (result.ok) {
        members = result.members;
        // "@" may already be typed
        update();
      } else {
        membersFailedAt = Date.now();
      }
    });
  };

  const pick = (member: BoardMember) => {
    if (!session || !suggestions) {
      return;
    }
    const { textarea } = session;
    const { text, caret } = insertMention(
      textarea.value,
      suggestions.mention,
      member.name,
    );
    session.picked.push({ employeeId: member.employeeId, name: member.name });
    setSuggestions(null);
    textarea.value = text;
    textarea.setSelectionRange(caret, caret);
    // the editor's own input handler saves the text and resizes the element
    textarea.dispatchEvent(new Event("input"));
    textarea.focus();
  };

  const notifyMentioned = (roomLink: string, added: string[]) => {
    const request = buildMentionRequest({
      roomLink,
      receiverEmployeeIds: added.slice(0, MAX_RECEIVERS),
      boardName: excalidrawAPI.getAppState().name,
    });
    if (!request) {
      return;
    }
    sendBoardNotification(everTeamsOrigin, request).then((result) => {
      excalidrawAPI.setToast({
        message: result.ok
          ? getMentionNotifiedMessage(result.notified)
          : getMentionErrorMessage(result.error),
      });
    });
  };

  /** Runs once the editor is gone, after Excalidraw saved the element. */
  const saveMentions = (ended: EditSession) => {
    const elements = excalidrawAPI.getSceneElementsIncludingDeleted();
    const element = elements.find(({ id }) => id === ended.elementId);
    if (!element || element.isDeleted || !isTextElement(element)) {
      return;
    }
    const { mentions, added } = resolveMentions({
      previous: ended.previousMentions,
      picked: ended.picked,
      text: element.originalText,
      namesById: new Map(
        (members ?? []).map(({ employeeId, name }) => [employeeId, name]),
      ),
    });
    if (!isSameMentions(readMentions(element.customData), mentions)) {
      excalidrawAPI.updateScene({
        elements: elements.map((current) =>
          current === element
            ? newElementWith(element, {
                customData: withMentions(element.customData, mentions),
              })
            : current,
        ),
      });
    }
    if (added.length) {
      notifyMentioned(ended.roomLink, added);
    }
  };

  const endSession = ({ save }: { save: boolean }) => {
    const ended = session;
    if (!ended) {
      return;
    }
    setSuggestions(null);
    ended.stop();
    session = null;
    if (save) {
      saveMentions(ended);
    }
  };

  const startSession = (textarea: HTMLTextAreaElement) => {
    // mentions need a room the teammates can open
    const roomLink = withEverTeamsOrigin(window.location.href, everTeamsOrigin);
    const target = getBoardLinkTarget(roomLink);
    const editingElement = excalidrawAPI.getAppState().editingTextElement;
    if (
      !target ||
      !("roomId" in target) ||
      !editingElement ||
      !isTextElement(editingElement) ||
      !textarea.parentNode
    ) {
      return;
    }
    const element = excalidrawAPI
      .getSceneElementsIncludingDeleted()
      .find(({ id }) => id === editingElement.id);

    const onBlur = () => setSuggestions(null);
    // the editor removes its textarea once the element is saved
    const observer = new MutationObserver(() => {
      if (session?.textarea === textarea && !textarea.isConnected) {
        endSession({ save: true });
      }
    });
    observer.observe(textarea.parentNode, { childList: true });
    textarea.addEventListener("input", update);
    textarea.addEventListener("keyup", update);
    textarea.addEventListener("click", update);
    textarea.addEventListener("blur", onBlur);
    textarea.setAttribute("aria-autocomplete", "list");

    session = {
      textarea,
      elementId: editingElement.id,
      roomLink,
      previousMentions: readMentions((element ?? editingElement).customData),
      picked: [],
      dismissedAt: null,
      stop: () => {
        observer.disconnect();
        textarea.removeEventListener("input", update);
        textarea.removeEventListener("keyup", update);
        textarea.removeEventListener("click", update);
        textarea.removeEventListener("blur", onBlur);
        textarea.removeAttribute("aria-autocomplete");
        textarea.removeAttribute("aria-expanded");
      },
    };
    loadMembers();
  };

  const onFocusIn = (event: FocusEvent) => {
    const textarea = event.target;
    if (!isTextEditor(textarea) || session?.textarea === textarea) {
      return;
    }
    // a previous editor whose removal went unseen
    endSession({ save: true });
    // The editor takes the focus while Excalidraw is still applying the
    // state that names the element being edited (appState.editingTextElement):
    // look at it once that state is applied.
    window.setTimeout(() => {
      if (!isStopped && !session && textarea.isConnected) {
        startSession(textarea);
      }
    });
  };

  // listens before the editor does, so that the keys of the list do not
  // also submit the text (Escape), indent it (Tab) or start a new line
  const onKeyDown = (event: KeyboardEvent) => {
    if (
      !session ||
      !suggestions ||
      event.target !== session.textarea ||
      event.isComposing
    ) {
      return;
    }
    const { members: found, activeIndex, mention } = suggestions;
    switch (event.key) {
      case KEYS.ARROW_DOWN:
        setSuggestions({
          ...suggestions,
          activeIndex: (activeIndex + 1) % found.length,
        });
        break;
      case KEYS.ARROW_UP:
        setSuggestions({
          ...suggestions,
          activeIndex: (activeIndex - 1 + found.length) % found.length,
        });
        break;
      case KEYS.ENTER:
      case KEYS.TAB:
        if (event.shiftKey || event.altKey || event[KEYS.CTRL_OR_CMD]) {
          return;
        }
        pick(found[activeIndex]);
        break;
      case KEYS.ESCAPE:
        session.dismissedAt = mention.start;
        setSuggestions(null);
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  document.addEventListener("focusin", onFocusIn);
  window.addEventListener("keydown", onKeyDown, true);

  return {
    pick,
    /** Stops listening; an edit in progress is left without notifying. */
    stop: () => {
      isStopped = true;
      document.removeEventListener("focusin", onFocusIn);
      window.removeEventListener("keydown", onKeyDown, true);
      endSession({ save: false });
    },
  };
};
