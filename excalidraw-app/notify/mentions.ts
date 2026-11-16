/** An "@query" being typed: the "@" is at `start`, the caret at `end`. */
export type MentionQuery = { start: number; end: number; query: string };

/** A teammate picked in the suggestions, with the name written after "@". */
export type PickedMention = { employeeId: string; name: string };

const MAX_MENTION_QUERY_LENGTH = 40;

/** Characters that may come right before the "@" of a mention. */
const RE_BEFORE_MENTION = /[\s([{"“‘«]/u;

/**
 * What may follow "@": a letter, then letters, digits and the marks names
 * use (apostrophes, dots, hyphens), with single spaces between words. A
 * trailing space ends the mention, so "@Ada Lovelace " is no longer typed.
 */
const RE_MENTION_QUERY =
  /^\p{L}[\p{L}\p{M}\p{N}'’.-]*(?: [\p{L}\p{M}\p{N}'’.-]+)*$/u;

const RE_NAME_CHARACTERS = /^[\p{L}\p{M}\p{N}'’.-]*/u;

/**
 * The mention being typed right before the caret, if any: an "@" at the
 * start of the text, or after a space or an opening bracket or quote (an
 * e-mail address is no mention), followed by at least one letter.
 */
export const findMentionQuery = (
  text: string,
  caret: number,
): MentionQuery | null => {
  const before = text.slice(0, caret);
  const start = before.lastIndexOf("@");
  if (start === -1 || caret - start - 1 > MAX_MENTION_QUERY_LENGTH) {
    return null;
  }
  if (start > 0 && !RE_BEFORE_MENTION.test(before[start - 1])) {
    return null;
  }
  const query = before.slice(start + 1);
  return RE_MENTION_QUERY.test(query) ? { start, end: caret, query } : null;
};

/**
 * Replaces the typed "@query", and the rest of the word the caret is in,
 * with "@Name " and returns the caret position after the space.
 */
export const insertMention = (
  text: string,
  mention: MentionQuery,
  name: string,
): { text: string; caret: number } => {
  const restOfWord = text.slice(mention.end).match(RE_NAME_CHARACTERS)![0];
  const after = text.slice(mention.end + restOfWord.length);
  const inserted = `@${name}`;
  return {
    text: `${text.slice(0, mention.start)}${inserted}${
      /^\s/.test(after) ? "" : " "
    }${after}`,
    caret: mention.start + inserted.length + 1,
  };
};

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whether "@name" is written in `text`, as a whole name. */
export const hasMention = (text: string, name: string): boolean =>
  new RegExp(
    `(?:^|[^\\p{L}\\p{M}\\p{N}_@])@${escapeRegExp(
      name,
    )}(?![\\p{L}\\p{M}\\p{N}])`,
    "u",
  ).test(text);

/** The employee ids mentioned in a text element (customData.mentions). */
export const readMentions = (
  customData: Record<string, any> | undefined,
): string[] => {
  const mentions = customData?.mentions;
  return Array.isArray(mentions)
    ? mentions.filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      )
    : [];
};

/** `customData` with `mentions` set, or without it when there is none. */
export const withMentions = (
  customData: Record<string, any> | undefined,
  mentions: readonly string[],
): Record<string, any> => {
  const { mentions: _previous, ...rest } = customData ?? {};
  return mentions.length ? { ...rest, mentions: [...mentions] } : rest;
};

export const isSameMentions = (
  a: readonly string[],
  b: readonly string[],
): boolean =>
  a.length === b.length &&
  a.every((id) => b.includes(id)) &&
  b.every((id) => a.includes(id));

/**
 * The mentions of a text element once an edit is saved, and who was newly
 * mentioned by that edit.
 *
 * - A teammate picked during the edit counts when "@Name" is still in the
 *   saved text.
 * - A mention the element had before the edit is kept, unless the name of
 *   that teammate is known and "@Name" is no longer in the text: mentioning
 *   them again later is then new again.
 * - `added` lists the teammates mentioned by this edit who were not
 *   mentioned before it: only they are notified.
 */
export const resolveMentions = ({
  previous,
  picked,
  text,
  namesById,
}: {
  /** customData.mentions when the edit started */
  previous: readonly string[];
  picked: readonly PickedMention[];
  /** the text as saved (originalText, before wrapping) */
  text: string;
  /** names of the teammates, when they are known */
  namesById: ReadonlyMap<string, string>;
}): { mentions: string[]; added: string[] } => {
  const pickedIds = new Set(
    picked
      .filter(({ name }) => hasMention(text, name))
      .map(({ employeeId }) => employeeId),
  );
  const kept = previous.filter((employeeId) => {
    const name = namesById.get(employeeId);
    return (
      name === undefined || hasMention(text, name) || pickedIds.has(employeeId)
    );
  });
  const mentions = Array.from(new Set([...kept, ...pickedIds]));
  const added = Array.from(pickedIds).filter((id) => !previous.includes(id));
  return { mentions, added };
};
