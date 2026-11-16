import {
  findMentionQuery,
  hasMention,
  insertMention,
  isSameMentions,
  readMentions,
  resolveMentions,
  withMentions,
} from "../notify/mentions";

const ADA = "0b1c9a4e-2f3d-4c5b-8a7e-6d5c4b3a2f10";
const GRACE = "7e6d5c4b-3a2f-4e1d-9c8b-7a6f5e4d3c21";
const NAMES = new Map([
  [ADA, "Ada Lovelace"],
  [GRACE, "Grace Hopper"],
]);

/** The mention typed before the caret, the caret being at "|". */
const typed = (textWithCaret: string) =>
  findMentionQuery(
    textWithCaret.replace("|", ""),
    textWithCaret.indexOf("|") === -1
      ? textWithCaret.length
      : textWithCaret.indexOf("|"),
  );

describe("typing a mention", () => {
  it.each([
    ["@A", { start: 0, end: 2, query: "A" }],
    ["Hi @Ada", { start: 3, end: 7, query: "Ada" }],
    ["Hi @Ada Lo", { start: 3, end: 10, query: "Ada Lo" }],
    ["line\n@gr", { start: 5, end: 8, query: "gr" }],
    ["(@Adé", { start: 1, end: 5, query: "Adé" }],
    ["@Ada and @Gr", { start: 9, end: 12, query: "Gr" }],
    ["@Jean-Luc O'Br", { start: 0, end: 14, query: "Jean-Luc O'Br" }],
    ["@Gr|ace and more", { start: 0, end: 3, query: "Gr" }],
  ])("finds the mention in %j", (text, mention) => {
    expect(typed(text)).toEqual(mention);
  });

  it.each([
    ["no @", "Hello"],
    ["a bare @", "Hi @"],
    ["an e-mail address", "ada@example"],
    ["a digit first", "@1st"],
    ["a trailing space", "@Ada "],
    ["two spaces", "@Ada  Lo"],
    ["a new line", "@Ada\nLo"],
    ["a query over 40 characters", `@${"a".repeat(41)}`],
  ])("finds none after %s", (_, text) => {
    expect(typed(text)).toBeNull();
  });

  it("writes the picked name, a space, and puts the caret after it", () => {
    const text = "Hi @Ad";
    expect(insertMention(text, typed(text)!, "Ada Lovelace")).toEqual({
      text: "Hi @Ada Lovelace ",
      caret: 17,
    });
  });

  it("replaces the rest of the word the caret is in and keeps what follows", () => {
    expect(
      insertMention("Hi @Adxyz, see you", typed("Hi @Ad|xyz, see you")!, "Ada"),
    ).toEqual({ text: "Hi @Ada , see you", caret: 8 });
    expect(
      insertMention("@Gr and Ada", typed("@Gr| and Ada")!, "Grace Hopper"),
    ).toEqual({ text: "@Grace Hopper and Ada", caret: 14 });
  });
});

describe("mentions in a saved text", () => {
  it("finds a whole name after @", () => {
    expect(hasMention("Thanks @Ada Lovelace!", "Ada Lovelace")).toBe(true);
    expect(hasMention("@Ada Lovelace", "Ada Lovelace")).toBe(true);
    expect(hasMention("(@Ada Lovelace)", "Ada Lovelace")).toBe(true);
    expect(hasMention("Thanks Ada Lovelace", "Ada Lovelace")).toBe(false);
    expect(hasMention("@Ada Lovelaced", "Ada Lovelace")).toBe(false);
    expect(hasMention("ada@Ada Lovelace", "Ada Lovelace")).toBe(false);
    expect(hasMention("@Ada\nLovelace", "Ada Lovelace")).toBe(false);
  });

  it("reads names with regular expression characters literally", () => {
    expect(hasMention("@J. (Jo) Doe+", "J. (Jo) Doe+")).toBe(true);
    expect(hasMention("@Jx (Jo) Doe+", "J. (Jo) Doe+")).toBe(false);
  });

  it("reads the mentioned ids of an element", () => {
    expect(readMentions(undefined)).toEqual([]);
    expect(readMentions({ mentions: "x" })).toEqual([]);
    expect(readMentions({ mentions: [ADA, 3, "", GRACE] })).toEqual([
      ADA,
      GRACE,
    ]);
  });

  it("writes the mentions and keeps the rest of customData", () => {
    expect(withMentions({ color: "red" }, [ADA])).toEqual({
      color: "red",
      mentions: [ADA],
    });
    expect(withMentions({ color: "red", mentions: [ADA] }, [])).toEqual({
      color: "red",
    });
    expect(withMentions(undefined, [GRACE])).toEqual({ mentions: [GRACE] });
  });

  it("compares mentions whatever their order", () => {
    expect(isSameMentions([ADA, GRACE], [GRACE, ADA])).toBe(true);
    expect(isSameMentions([ADA], [ADA, GRACE])).toBe(false);
    expect(isSameMentions([], [])).toBe(true);
  });
});

describe("mentions of an edit", () => {
  it("adds the teammates picked whose name is still in the text", () => {
    expect(
      resolveMentions({
        previous: [],
        picked: [
          { employeeId: ADA, name: "Ada Lovelace" },
          { employeeId: GRACE, name: "Grace Hopper" },
          { employeeId: ADA, name: "Ada Lovelace" },
        ],
        text: "@Ada Lovelace please review",
        namesById: NAMES,
      }),
    ).toEqual({ mentions: [ADA], added: [ADA] });
  });

  it("does not add again a teammate mentioned before the edit", () => {
    expect(
      resolveMentions({
        previous: [ADA],
        picked: [
          { employeeId: ADA, name: "Ada Lovelace" },
          { employeeId: GRACE, name: "Grace Hopper" },
        ],
        text: "@Ada Lovelace and @Grace Hopper",
        namesById: NAMES,
      }),
    ).toEqual({ mentions: [ADA, GRACE], added: [GRACE] });
  });

  it("drops an earlier mention whose name left the text", () => {
    expect(
      resolveMentions({
        previous: [ADA, GRACE],
        picked: [],
        text: "@Grace Hopper only",
        namesById: NAMES,
      }),
    ).toEqual({ mentions: [GRACE], added: [] });
  });

  it("keeps an earlier mention of a teammate whose name is not known", () => {
    expect(
      resolveMentions({
        previous: [ADA],
        picked: [],
        text: "no names here",
        namesById: new Map(),
      }),
    ).toEqual({ mentions: [ADA], added: [] });
  });

  it("adds nobody when the picked name was removed before saving", () => {
    expect(
      resolveMentions({
        previous: [],
        picked: [{ employeeId: GRACE, name: "Grace Hopper" }],
        text: "never mind",
        namesById: NAMES,
      }),
    ).toEqual({ mentions: [], added: [] });
  });
});
