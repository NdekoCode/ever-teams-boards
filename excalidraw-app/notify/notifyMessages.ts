import { t } from "@excalidraw/excalidraw/i18n";

import type { BoardNotifyError } from "./boardNotify";

const ERROR_MESSAGE_KEYS = {
  "signed-out": "boardNotify.errors.signedOut",
  forbidden: "boardNotify.errors.forbidden",
  "rate-limited": "boardNotify.errors.rateLimited",
  unavailable: "boardNotify.errors.unavailable",
  failed: "boardNotify.errors.failed",
} as const;

/** What to tell the person when Ever Teams did not notify anyone. */
export const getNotifyErrorMessage = (error: BoardNotifyError): string =>
  t(ERROR_MESSAGE_KEYS[error] ?? ERROR_MESSAGE_KEYS.failed);

/** What to tell the person once Ever Teams notified `count` people. */
export const getNotifiedMessage = (count: number): string =>
  count === 1
    ? t("boardNotify.notifiedOne")
    : t("boardNotify.notifiedMany", { count });
