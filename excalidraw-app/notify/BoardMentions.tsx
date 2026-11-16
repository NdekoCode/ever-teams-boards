import { useEffect, useId, useRef, useState } from "react";
import clsx from "clsx";

import { useI18n } from "@excalidraw/excalidraw/i18n";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { MemberAvatar } from "./MemberAvatar";
import { watchTextEditorMentions } from "./textEditorMentions";

import "./BoardMentions.scss";

import type { CSSProperties } from "react";

import type { BoardMember } from "./boardNotify";
import type { MentionSuggestions } from "./textEditorMentions";

const LIST_OFFSET_PX = 4;
const OPTION_HEIGHT_PX = 36;
const LIST_WIDTH_PX = 256;

/**
 * Puts the list below the text editor, or above it when there is no room
 * below, and keeps it inside the window.
 */
const getListStyle = ({
  anchor,
  members,
}: MentionSuggestions): CSSProperties => {
  const height = members.length * OPTION_HEIGHT_PX + 2 * LIST_OFFSET_PX;
  const left = Math.max(
    LIST_OFFSET_PX,
    Math.min(anchor.left, window.innerWidth - LIST_WIDTH_PX - LIST_OFFSET_PX),
  );
  return anchor.bottom + LIST_OFFSET_PX + height > window.innerHeight
    ? { left, bottom: window.innerHeight - anchor.top + LIST_OFFSET_PX }
    : { left, top: anchor.bottom + LIST_OFFSET_PX };
};

/**
 * Suggests teammates while "@" is typed in a text of a live collaboration
 * room, and notifies the ones newly mentioned when the text is saved. See
 * watchTextEditorMentions.
 */
export const BoardMentions = ({
  excalidrawAPI,
  everTeamsOrigin,
}: {
  excalidrawAPI: ExcalidrawImperativeAPI;
  everTeamsOrigin: string;
}) => {
  const { t } = useI18n();
  const listId = useId();
  const [suggestions, setSuggestions] = useState<MentionSuggestions | null>(
    null,
  );
  const pickRef = useRef<(member: BoardMember) => void>(() => {});

  useEffect(() => {
    const mentions = watchTextEditorMentions({
      excalidrawAPI,
      everTeamsOrigin,
      listId,
      onSuggestionsChange: setSuggestions,
    });
    pickRef.current = mentions.pick;
    return () => {
      mentions.stop();
      setSuggestions(null);
    };
  }, [excalidrawAPI, everTeamsOrigin, listId]);

  if (!suggestions) {
    return null;
  }

  return (
    <ul
      id={listId}
      className="BoardMentions"
      role="listbox"
      aria-label={t("boardNotify.mentions.listLabel")}
      style={getListStyle(suggestions)}
    >
      {suggestions.members.map((member, index) => (
        <li
          key={member.employeeId}
          id={`${listId}-${index}`}
          role="option"
          aria-selected={index === suggestions.activeIndex}
          className={clsx("BoardMentions__option", {
            "BoardMentions__option--active": index === suggestions.activeIndex,
          })}
          // keep the focus, hence the edit, in the text editor
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => pickRef.current(member)}
        >
          <MemberAvatar member={member} />
          <span className="BoardMentions__name">{member.name}</span>
        </li>
      ))}
    </ul>
  );
};
