"use client";
import { memo } from "react";
import { Avatar, VerifiedBadge, convName, listTime, useLongPress, type Conv } from "./ui";

function previewOf(c: Conv, meUsername: string) {
  if (c.last_deleted) return "Pesan ini telah dihapus";
  if (!c.last_body) return c.kind === "ai" ? "Tanya apa saja ke Kev-Ai" : "Belum ada pesan";
  const mine = c.last_username === meUsername;
  const who = c.last_kind === "ai" ? "Kev-Ai" : mine ? "Kamu" : c.last_username;
  return c.kind === "dm" || c.kind === "ai" ? (mine ? `Kamu: ${c.last_body}` : c.last_body) : `${who}: ${c.last_body}`;
}

export default memo(function ConvItem({ c, on, leaving, meUsername, onOpen, onMenu, onPrefetch }: {
  c: Conv; on: boolean; leaving: boolean; meUsername: string;
  onOpen: (id: string) => void; onMenu: (c: Conv, x: number, y: number) => void;
  onPrefetch?: (id: string) => void;
}) {
  const lp = useLongPress((x, y) => onMenu(c, x, y));
  return (
    <li className={leaving ? "leaving" : ""} onPointerEnter={() => onPrefetch?.(c.id)} onPointerDown={() => onPrefetch?.(c.id)}>
      <button className={`conv${on ? " on" : ""}${c.kind === "ai" ? " ai" : ""}`} {...lp.bind}
        onClick={() => { if (lp.wasLong()) return; onOpen(c.id); }}>
        <Avatar name={convName(c)} src={c.other_avatar} kind={c.kind === "dm" ? undefined : c.kind} />
        <span className="meta">
          <span className="row">
            <b>{convName(c)}{(c.kind === "ai" || (c.kind === "dm" && c.other_verified)) && <VerifiedBadge title={c.kind === "ai" ? "Kev-Ai terverifikasi" : "Terverifikasi"} />}{c.kind === "ai" && <em className="badge">AI</em>}</b>
            {c.last_at && <small className={c.unread ? "hot" : ""}>{listTime(c.last_at)}</small>}
          </span>
          <span className="row">
            <span className={`preview${c.last_deleted ? " gone" : ""}`}>{previewOf(c, meUsername)}</span>
            {c.unread > 0 && <span className="count">{c.unread_mention && <i>@</i>}{c.unread > 99 ? "99+" : c.unread}</span>}
          </span>
        </span>
      </button>
    </li>
  );
});
