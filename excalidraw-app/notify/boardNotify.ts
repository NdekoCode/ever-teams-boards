/**
 * Client for the notification routes Ever Teams serves to the Board. The
 * Board holds no Gauzy token: like the session check (see auth/index.tsx),
 * each call goes to the Ever Teams deployment of the visit, and the browser
 * sends that deployment's own session cookies along.
 */

/** A teammate of the signed-in person, as GET /api/board/members lists it. */
export type BoardMember = {
  employeeId: string;
  name: string;
  imageUrl: string | null;
};

export type BoardNotifyKind = "share" | "mention";

/** Body of POST /api/board/notify. */
export type BoardNotifyRequest = {
  kind: BoardNotifyKind;
  /** 1 to 50 employee ids, without duplicates. */
  receiverEmployeeIds: string[];
  /** Live collaboration room, exclusive with snapshotId. */
  roomId?: string;
  /** Read-only snapshot made by "Export to link", exclusive with roomId. */
  snapshotId?: string;
  boardName?: string;
  /** A Board address; it carries the encryption key only when the person chose so. */
  link?: string;
};

/** Why Ever Teams did not do what the Board asked. */
export type BoardNotifyError =
  /** 401: the Ever Teams session has ended, the person must sign in again. */
  | "signed-out"
  /** 403: the person may not do this; asking again will not help. */
  | "forbidden"
  /** 429: too many requests, the person may try again in a minute. */
  | "rate-limited"
  /** 503, or Ever Teams could not be reached: the person may try later. */
  | "unavailable"
  /** Any other answer (400, 404, 415, a malformed body). */
  | "failed";

export type BoardMembersResult =
  | { ok: true; members: BoardMember[] }
  | { ok: false; error: BoardNotifyError };

export type BoardNotifyResult =
  | { ok: true; notified: number }
  | { ok: false; error: BoardNotifyError };

export const toBoardNotifyError = (status: number): BoardNotifyError => {
  switch (status) {
    case 401:
      return "signed-out";
    case 403:
      return "forbidden";
    case 429:
      return "rate-limited";
    case 503:
      return "unavailable";
    default:
      return "failed";
  }
};

const toBoardMember = (item: unknown): BoardMember | null => {
  if (!item || typeof item !== "object") {
    return null;
  }
  const { employeeId, name, imageUrl } = item as Record<string, unknown>;
  if (typeof employeeId !== "string" || !employeeId) {
    return null;
  }
  if (typeof name !== "string" || !name.trim()) {
    return null;
  }
  return {
    employeeId,
    name: name.trim(),
    imageUrl: typeof imageUrl === "string" && imageUrl ? imageUrl : null,
  };
};

/**
 * Lists the teammates of the signed-in person, sorted by name. Entries
 * without an employee id or a name are left out, as are duplicates.
 */
export const fetchBoardMembers = async (
  everTeamsOrigin: string,
): Promise<BoardMembersResult> => {
  let res: Response;
  try {
    res = await fetch(`${everTeamsOrigin}/api/board/members`, {
      credentials: "include",
    });
  } catch (error) {
    console.warn(`Could not reach ${everTeamsOrigin} for teammates`, error);
    return { ok: false, error: "unavailable" };
  }
  if (!res.ok) {
    return { ok: false, error: toBoardNotifyError(res.status) };
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch (error) {
    return { ok: false, error: "failed" };
  }
  const items = (data as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) {
    return { ok: false, error: "failed" };
  }

  const members = new Map<string, BoardMember>();
  for (const item of items) {
    const member = toBoardMember(item);
    if (member && !members.has(member.employeeId)) {
      members.set(member.employeeId, member);
    }
  }
  return {
    ok: true,
    members: Array.from(members.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
  };
};

/**
 * Asks Ever Teams to notify people. Sends one request and never retries it:
 * the caller shows the outcome and lets the person decide.
 */
export const sendBoardNotification = async (
  everTeamsOrigin: string,
  request: BoardNotifyRequest,
): Promise<BoardNotifyResult> => {
  let res: Response;
  try {
    res = await fetch(`${everTeamsOrigin}/api/board/notify`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  } catch (error) {
    console.warn(`Could not reach ${everTeamsOrigin} to notify`, error);
    return { ok: false, error: "unavailable" };
  }
  if (!res.ok) {
    return { ok: false, error: toBoardNotifyError(res.status) };
  }

  let notified: unknown;
  try {
    notified = ((await res.json()) as { notified?: unknown } | null)?.notified;
  } catch (error) {
    notified = undefined;
  }
  return {
    ok: true,
    // the request succeeded even when its answer cannot be read
    notified:
      typeof notified === "number" &&
      Number.isInteger(notified) &&
      notified >= 0
        ? notified
        : request.receiverEmployeeIds.length,
  };
};
