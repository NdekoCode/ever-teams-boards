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

/** What to tell the person once Ever Teams notified `count` people they mentioned. */
export const getMentionNotifiedMessage = (count: number): string =>
  count === 1
    ? t("boardNotify.mentions.notifiedOne")
    : t("boardNotify.mentions.notifiedMany", { count });

/** What to tell the person when the people they mentioned were not notified. */
export const getMentionErrorMessage = (error: BoardNotifyError): string =>
  error === "failed"
    ? t("boardNotify.mentions.failed")
    : `${t("boardNotify.mentions.notNotified")} ${getNotifyErrorMessage(
        error,
      )}`;
