import { useState } from "react";

import { getClientColor } from "@excalidraw/excalidraw/clients";

import type { SocketId } from "@excalidraw/excalidraw/types";

import { getMemberImageUrl, getMemberInitials } from "./members";

import "./MemberAvatar.scss";

import type { BoardMember } from "./boardNotify";

/** The picture of a teammate, or their initials when there is none. */
export const MemberAvatar = ({ member }: { member: BoardMember }) => {
  const [failed, setFailed] = useState(false);
  const imageUrl = failed ? null : getMemberImageUrl(member);

  return (
    <span
      className="MemberAvatar"
      aria-hidden="true"
      style={
        imageUrl
          ? undefined
          : {
              background: getClientColor(
                member.employeeId as SocketId,
                undefined,
              ),
            }
      }
    >
      {imageUrl ? (
        <img
          className="MemberAvatar__image"
          src={imageUrl}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        getMemberInitials(member.name)
      )}
    </span>
  );
};
