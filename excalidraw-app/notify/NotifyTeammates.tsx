import { useEffect, useId, useRef, useState } from "react";
import clsx from "clsx";

import { KEYS } from "@excalidraw/common";
import { FilledButton } from "@excalidraw/excalidraw/components/FilledButton";
import { usersIcon } from "@excalidraw/excalidraw/components/icons";
import { useI18n } from "@excalidraw/excalidraw/i18n";
// the search field uses the look of TextField
import "@excalidraw/excalidraw/components/TextField.scss";

import { useAtomValue } from "../app-jotai";
import { everTeamsOriginAtom } from "../auth/everTeamsOrigin";

import { fetchBoardMembers, sendBoardNotification } from "./boardNotify";
import { MemberAvatar } from "./MemberAvatar";
import { searchMembers } from "./members";
import { getNotifiedMessage, getNotifyErrorMessage } from "./notifyMessages";
import {
  buildShareRequest,
  getBoardLinkTarget,
  MAX_RECEIVERS,
} from "./notifyRequest";

import "./NotifyTeammates.scss";

import type { KeyboardEvent } from "react";

import type { BoardMember, BoardNotifyError } from "./boardNotify";

export type NotifyTeammatesProps = {
  /**
   * Link of the live collaboration room or of the read-only snapshot, made
   * with toShareableBoardUrl so that it carries the Ever Teams origin.
   */
  boardLink: string;
  /** The scene name (appState.name), when there is one. */
  boardName?: string | null;
};

type MembersState =
  | { status: "loading" }
  | { status: "loaded"; members: BoardMember[] }
  | { status: "error"; error: BoardNotifyError };

type Outcome =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "notified"; count: number }
  | { status: "error"; error: BoardNotifyError };

/** Where people sign in to the Ever Teams deployment again. */
const getSignInUrl = (everTeamsOrigin: string) =>
  `${everTeamsOrigin}/auth/passcode`;

const SignInLink = ({ everTeamsOrigin }: { everTeamsOrigin: string }) => {
  const { t } = useI18n();
  return (
    // a new tab keeps the Board, its room and its key where they are
    <a
      className="NotifyTeammates__signIn"
      href={getSignInUrl(everTeamsOrigin)}
      target="_blank"
      rel="noopener noreferrer"
    >
      {t("boardNotify.signIn")}
    </a>
  );
};

const NotifyTeammatesPanel = ({
  id,
  everTeamsOrigin,
  boardLink,
  boardName,
}: NotifyTeammatesProps & { id: string; everTeamsOrigin: string }) => {
  const { t } = useI18n();
  const searchId = `${id}-search`;

  const [members, setMembers] = useState<MembersState>({ status: "loading" });
  const [reloads, setReloads] = useState(0);
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [includeKey, setIncludeKey] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>({ status: "idle" });
  const isMountedRef = useRef(true);
  const outcomeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // the teammates are loaded each time the part opens
  useEffect(() => {
    let cancelled = false;
    setMembers({ status: "loading" });
    fetchBoardMembers(everTeamsOrigin).then((result) => {
      if (!cancelled) {
        setMembers(
          result.ok
            ? { status: "loaded", members: result.members }
            : { status: "error", error: result.error },
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [everTeamsOrigin, reloads]);

  const isSending = outcome.status === "sending";
  const isAtLimit = selectedIds.length >= MAX_RECEIVERS;

  const toggleMember = (employeeId: string, checked: boolean) => {
    setSelectedIds((ids) =>
      checked
        ? ids.includes(employeeId) || ids.length >= MAX_RECEIVERS
          ? ids
          : [...ids, employeeId]
        : ids.filter((id) => id !== employeeId),
    );
    setOutcome((outcome) =>
      outcome.status === "sending" ? outcome : { status: "idle" },
    );
  };

  const notify = async () => {
    if (isSending) {
      return;
    }
    const request = buildShareRequest({
      boardLink,
      receiverEmployeeIds: selectedIds,
      includeKey,
      boardName,
    });
    if (!request) {
      return;
    }
    setOutcome({ status: "sending" });
    const result = await sendBoardNotification(everTeamsOrigin, request);
    if (!isMountedRef.current) {
      return;
    }
    if (result.ok) {
      setOutcome({ status: "notified", count: result.notified });
      // nobody gets the same notification twice by a second click
      setSelectedIds([]);
    } else {
      setOutcome({ status: "error", error: result.error });
    }
    // the disabled button lost the focus: keep it in the dialog, next to
    // the button, so that Escape and Tab go on working from there
    outcomeRef.current?.focus();
  };

  const renderMembers = () => {
    if (members.status === "loading") {
      return (
        <p className="NotifyTeammates__message" role="status">
          {t("boardNotify.share.loading")}
        </p>
      );
    }
    if (members.status === "error") {
      return (
        <div className="NotifyTeammates__message NotifyTeammates__message--error">
          <span role="alert">
            {members.error === "failed"
              ? t("boardNotify.share.loadFailed")
              : getNotifyErrorMessage(members.error)}
          </span>
          {members.error === "signed-out" && (
            <SignInLink everTeamsOrigin={everTeamsOrigin} />
          )}
          {/* asking again will not make it allowed */}
          {members.error !== "forbidden" && (
            <button
              type="button"
              className="NotifyTeammates__link"
              onClick={() => setReloads((count) => count + 1)}
            >
              {t("boardNotify.share.retry")}
            </button>
          )}
        </div>
      );
    }
    if (!members.members.length) {
      return (
        <p className="NotifyTeammates__message">
          {t("boardNotify.share.noMembers")}
        </p>
      );
    }

    const visibleMembers = searchMembers(members.members, query);
    return (
      <>
        <div className="ExcTextField ExcTextField--fullWidth">
          <label className="ExcTextField__label" htmlFor={searchId}>
            {t("boardNotify.share.searchLabel")}
          </label>
          <div className="ExcTextField__input">
            <input
              id={searchId}
              // type="text" so that the canvas shortcuts leave typing alone
              type="text"
              autoComplete="off"
              value={query}
              placeholder={t("boardNotify.share.searchPlaceholder")}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>
        {visibleMembers.length ? (
          <ul
            className="NotifyTeammates__members"
            aria-label={t("boardNotify.share.membersLabel")}
          >
            {visibleMembers.map((member) => {
              const checked = selectedIds.includes(member.employeeId);
              return (
                <li key={member.employeeId}>
                  <label
                    className={clsx("NotifyTeammates__member", {
                      "NotifyTeammates__member--checked": checked,
                    })}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!checked && (isAtLimit || isSending)}
                      onChange={(event) =>
                        toggleMember(member.employeeId, event.target.checked)
                      }
                    />
                    <MemberAvatar member={member} />
                    <span className="NotifyTeammates__memberName">
                      {member.name}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="NotifyTeammates__message">
            {t("boardNotify.share.noMatch", { query: query.trim() })}
          </p>
        )}
        <p className="NotifyTeammates__count" aria-live="polite">
          {t("boardNotify.share.selected", { count: selectedIds.length })}
          {isAtLimit &&
            ` · ${t("boardNotify.share.limit", { max: MAX_RECEIVERS })}`}
        </p>
      </>
    );
  };

  return (
    <div id={id} className="NotifyTeammates__panel">
      <p className="NotifyTeammates__intro">{t("boardNotify.share.intro")}</p>
      {renderMembers()}
      <div className="NotifyTeammates__includeLink">
        <label>
          <input
            type="checkbox"
            checked={includeKey}
            onChange={(event) => setIncludeKey(event.target.checked)}
          />
          {t("boardNotify.share.includeLink")}
        </label>
        <p className="NotifyTeammates__hint">
          {t("boardNotify.share.includeLinkHint")}
        </p>
      </div>
      <div className="NotifyTeammates__actions">
        <div
          className={clsx("NotifyTeammates__outcome", {
            "NotifyTeammates__outcome--success": outcome.status === "notified",
            "NotifyTeammates__outcome--error": outcome.status === "error",
          })}
          role="status"
          aria-live="polite"
          tabIndex={-1}
          ref={outcomeRef}
        >
          {outcome.status === "notified" && getNotifiedMessage(outcome.count)}
          {outcome.status === "error" && (
            <>
              {getNotifyErrorMessage(outcome.error)}
              {outcome.error === "signed-out" && (
                <SignInLink everTeamsOrigin={everTeamsOrigin} />
              )}
            </>
          )}
        </div>
        <FilledButton
          size="medium"
          label={
            isSending
              ? t("boardNotify.share.sending")
              : t("boardNotify.share.notify")
          }
          disabled={isSending || !selectedIds.length}
          onClick={notify}
        />
      </div>
    </div>
  );
};

/**
 * "Notify teammates" part of the share dialogs: the person picks teammates
 * and Ever Teams notifies them, with one request when they click Notify.
 * Hidden when the visit has no Ever Teams origin or the link opens no room
 * or snapshot.
 */
export const NotifyTeammates = ({
  boardLink,
  boardName,
}: NotifyTeammatesProps) => {
  const { t } = useI18n();
  const everTeamsOrigin = useAtomValue(everTeamsOriginAtom);
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();

  if (!everTeamsOrigin || !getBoardLinkTarget(boardLink)) {
    return null;
  }

  return (
    <section
      className="NotifyTeammates"
      onKeyDown={(event: KeyboardEvent) => {
        // keep the canvas shortcuts (space, letters...) away from the
        // checkboxes and buttons of this part; Escape still closes the dialog
        if (event.key !== KEYS.ESCAPE) {
          event.stopPropagation();
        }
      }}
    >
      <button
        type="button"
        className="NotifyTeammates__toggle"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen((isOpen) => !isOpen)}
      >
        <span className="NotifyTeammates__toggleIcon" aria-hidden="true">
          {usersIcon}
        </span>
        {t("boardNotify.share.toggle")}
        <span
          className={clsx("NotifyTeammates__chevron", {
            "NotifyTeammates__chevron--open": isOpen,
          })}
          aria-hidden="true"
        />
      </button>
      {isOpen && (
        <NotifyTeammatesPanel
          id={panelId}
          everTeamsOrigin={everTeamsOrigin}
          boardLink={boardLink}
          boardName={boardName}
        />
      )}
    </section>
  );
};
