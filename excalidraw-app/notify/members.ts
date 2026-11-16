import type { BoardMember } from "./boardNotify";

/** Lower case, without accents and with single spaces, for comparisons. */
const normalizeName = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const WORD_SEPARATORS = new Set([" ", "-", "'", "’", "."]);

/**
 * Where `name`, normalized, matches `query`: 0 when the name starts with it,
 * 1 when one of its other words does, null otherwise. Accents and case are
 * ignored, so "ade" finds "Adélaïde" and "lovelace" finds "Ada Lovelace".
 */
const matchName = (name: string, query: string): 0 | 1 | null => {
  const normalizedName = normalizeName(name);
  if (normalizedName.startsWith(query)) {
    return 0;
  }
  for (let index = 1; index < normalizedName.length; index++) {
    if (
      WORD_SEPARATORS.has(normalizedName[index - 1]) &&
      normalizedName.startsWith(query, index)
    ) {
      return 1;
    }
  }
  return null;
};

/**
 * The members whose name matches `query`, the names starting with it first,
 * otherwise in their order. An empty query keeps every member.
 */
export const searchMembers = (
  members: readonly BoardMember[],
  query: string,
  limit = Infinity,
): BoardMember[] => {
  const normalizedQuery = normalizeName(query);
  if (!normalizedQuery) {
    return members.slice(0, limit);
  }
  const ranked: { member: BoardMember; rank: number; index: number }[] = [];
  members.forEach((member, index) => {
    const rank = matchName(member.name, normalizedQuery);
    if (rank !== null) {
      ranked.push({ member, rank, index });
    }
  });
  return ranked
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .slice(0, limit)
    .map(({ member }) => member);
};

/** Up to two initials: those of the first and the last word of the name. */
export const getMemberInitials = (name: string): string => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) {
    return "?";
  }
  const initial = (word: string) =>
    String.fromCodePoint(word.codePointAt(0)!).toLocaleUpperCase();
  return words.length === 1
    ? initial(words[0])
    : `${initial(words[0])}${initial(words[words.length - 1])}`;
};

/** The picture of a member, when it is an http(s) address. */
export const getMemberImageUrl = (member: BoardMember): string | null => {
  if (!member.imageUrl) {
    return null;
  }
  try {
    const { protocol } = new URL(member.imageUrl);
    return protocol === "https:" || protocol === "http:"
      ? member.imageUrl
      : null;
  } catch (error) {
    return null;
  }
};
