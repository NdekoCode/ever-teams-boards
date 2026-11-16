import type { BoardNotifyRequest } from "./boardNotify";

/** Most people POST /api/board/notify accepts in one request. */
export const MAX_RECEIVERS = 50;
export const MAX_BOARD_NAME_LENGTH = 200;
export const MAX_LINK_LENGTH = 2048;

/**
 * The fragment of a Board link: `#room=<roomId>,<key>` for a live
 * collaboration room, `#json=<snapshotId>,<key>` for a read-only snapshot.
 * The key decrypts the Board.
 */
const RE_BOARD_LINK_FRAGMENT =
  /^#(room|json)=([A-Za-z0-9_-]{1,128}),[A-Za-z0-9_-]+$/;

export type BoardLinkTarget = { roomId: string } | { snapshotId: string };

/**
 * The room or snapshot a Board link opens: the id before the comma of its
 * fragment, never the key after it. Null for any other address.
 */
export const getBoardLinkTarget = (
  boardLink: string,
): BoardLinkTarget | null => {
  let hash: string;
  try {
    hash = new URL(boardLink).hash;
  } catch (error) {
    return null;
  }
  const match = hash.match(RE_BOARD_LINK_FRAGMENT);
  if (!match) {
    return null;
  }
  return match[1] === "room" ? { roomId: match[2] } : { snapshotId: match[2] };
};

/** The Board link without its fragment, hence without the key. */
export const withoutFragment = (boardLink: string): string => {
  const url = new URL(boardLink);
  url.hash = "";
  return url.toString();
};

/** Employee ids without empty entries and duplicates, in their order. */
export const toReceiverIds = (ids: Iterable<string>): string[] =>
  Array.from(new Set(Array.from(ids).filter((id) => !!id)));

const toBoardName = (name: string | null | undefined) => {
  const trimmed = name?.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.length <= MAX_BOARD_NAME_LENGTH) {
    return trimmed;
  }
  let shortened = trimmed.slice(0, MAX_BOARD_NAME_LENGTH);
  // do not cut a character written with two UTF-16 code units in half
  if (/[\uD800-\uDBFF]$/.test(shortened)) {
    shortened = shortened.slice(0, -1);
  }
  return shortened.trimEnd();
};

const buildRequest = ({
  kind,
  target,
  receiverEmployeeIds,
  boardName,
  link,
}: {
  kind: BoardNotifyRequest["kind"];
  target: BoardLinkTarget;
  receiverEmployeeIds: Iterable<string>;
  boardName?: string | null;
  link: string;
}): BoardNotifyRequest | null => {
  const receivers = toReceiverIds(receiverEmployeeIds);
  if (receivers.length === 0 || receivers.length > MAX_RECEIVERS) {
    return null;
  }

  const request: BoardNotifyRequest = {
    kind,
    receiverEmployeeIds: receivers,
    ...target,
  };
  const name = toBoardName(boardName);
  if (name) {
    request.boardName = name;
  }
  // Ever Teams turns a longer link down; the notification is still useful
  if (link.length <= MAX_LINK_LENGTH) {
    request.link = link;
  }
  return request;
};

/**
 * Request telling people that a Board was shared with them. `boardLink` is
 * the link of the room or snapshot, made with toShareableBoardUrl. It goes
 * with its key only when the person ticked "Include the link".
 */
export const buildShareRequest = ({
  boardLink,
  receiverEmployeeIds,
  includeKey,
  boardName,
}: {
  boardLink: string;
  receiverEmployeeIds: Iterable<string>;
  includeKey: boolean;
  boardName?: string | null;
}): BoardNotifyRequest | null => {
  const target = getBoardLinkTarget(boardLink);
  if (!target) {
    return null;
  }
  return buildRequest({
    kind: "share",
    target,
    receiverEmployeeIds,
    boardName,
    link: includeKey ? boardLink : withoutFragment(boardLink),
  });
};

/**
 * Request telling people they were mentioned in the live collaboration room
 * of `roomLink` (made with toShareableBoardUrl). The link never carries the
 * key, and nothing of the Board content is sent.
 */
export const buildMentionRequest = ({
  roomLink,
  receiverEmployeeIds,
  boardName,
}: {
  roomLink: string;
  receiverEmployeeIds: Iterable<string>;
  boardName?: string | null;
}): BoardNotifyRequest | null => {
  const target = getBoardLinkTarget(roomLink);
  if (!target || !("roomId" in target)) {
    return null;
  }
  return buildRequest({
    kind: "mention",
    target,
    receiverEmployeeIds,
    boardName,
    link: withoutFragment(roomLink),
  });
};
