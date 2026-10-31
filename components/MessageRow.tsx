"use client";
import { memo, useRef } from "react";
import { useSwipeReply } from "@/lib/useSwipeReply";
import { AI_HANDLE } from "@/lib/mentions";
import { Avatar, Icon, Rich, VerifiedBadge, clock, dayLabel, nameColor, useLongPress, type Msg } from "./ui";

export default memo(function MessageRow({ m, mine, first, newDay, showName, showAv, meUsername, fresh, leaving, readBlue, onMenu, onRetry, onReply, onOpenProfile, onReact, onShowReactions }: {
  m: Msg; mine: boolean; first: boolean; newDay: boolean; showName: boolean; showAv: boolean; meUsername: string;
  fresh: boolean; leaving: boolean; readBlue?: boolean;
  onMenu: (m: Msg, x: number, y: number) => void; onRetry: (m: Msg) => void; onReply?: (m: Msg) => void;
  onOpenProfile?: (username: string) => void;
  onReact?: (m: Msg, x: number, y: number) => void;       // buka bar reaksi (tombol senyum)
  onShowReactions?: (m: Msg) => void;                    // ketuk chip reaksi -> daftar siapa saja
}) {
  const lp = useLongPress((x, y) => onMenu(m, x, y));
  const gone = !!m.deleted_at;
  const ai = m.kind === "ai";
  const msgRef = useRef<HTMLDivElement>(null);
  const canReact = !!onReact && !gone && m.status !== "failed";
  const reactions = !gone && m.reactions?.length ? m.reactions : null;
  const myEmoji = reactions?.find((r) => r.u.some((x) => x.u === meUsername))?.e ?? null;
  const total = reactions ? reactions.reduce((n, r) => n + r.u.length, 0) : 0;
  // Geser ke kanan = balas (tidak untuk pesan terhapus, sedang dikirim, atau gagal)
  useSwipeReply(msgRef, !!onReply && !gone && m.status !== "sending" && m.status !== "failed", () => onReply?.(m));
  return (
    <div className={`row-wrap${leaving ? " leaving" : ""}`}>
      {newDay && <div className="day"><span>{dayLabel(m.created_at)}</span></div>}
      <div ref={msgRef} className={`msg ${mine ? "mine" : ""} ${ai ? "ai" : ""} ${first ? "first" : ""} ${fresh ? "fresh" : ""}`}>
        <span className="swipe-ic" aria-hidden><Icon n="reply" size={18} /></span>
        {showAv && (
          <span className="msg-av">{first && (
            ai ? <Avatar name={m.name || m.username || "?"} src={m.avatar_url} kind="ai" size={30} />
            : <button type="button" className="av-btn" onClick={() => m.username && onOpenProfile?.(m.username)} aria-label={`Profil @${m.username}`}>
                <Avatar name={m.name || m.username || "?"} src={m.avatar_url} size={30} />
              </button>
          )}</span>
        )}
        <div className={`bubble${gone ? " gone" : ""}${m.status === "failed" ? " failed" : ""}${reactions ? " has-react" : ""}`} {...lp.bind}
          onDoubleClick={(e) => {
            // Cadangan di layar sentuh kalau tekan lama gagal: ketuk dua kali membuka menu yang sama.
            if (!window.matchMedia?.("(hover: none)").matches) return;
            if ((e.target as HTMLElement).closest?.("a,button")) return;
            e.preventDefault();
            onMenu(m, e.clientX, e.clientY);
          }}>
          {showName && (
            <button type="button" className="sender" style={{ color: ai ? "var(--accent-text)" : nameColor(m.username || "") }}
              onClick={() => !ai && m.username && onOpenProfile?.(m.username)}
              disabled={ai}>
              {ai ? "Kev-Ai" : m.name}
              {(ai || m.verified) && <VerifiedBadge title={ai ? "Kev-Ai terverifikasi" : "Terverifikasi"} />}
              <small> @{m.username}</small>
              {ai && <em className="badge">AI</em>}
            </button>
          )}
          {!gone && m.reply_to && m.reply_body != null && (
            <div className="quote">
              <b>{m.reply_username === meUsername ? "Kamu" : m.reply_username === AI_HANDLE ? "Kev-Ai" : `@${m.reply_username}`}</b>
              <span>{m.reply_body === "" ? "Pesan ini telah dihapus" : m.reply_body}</span>
            </div>
          )}
          <span className="text">
            {gone
              ? <><Icon n="block" size={14} /> {mine ? "Kamu menghapus pesan ini" : "Pesan ini telah dihapus"}</>
              : <>
                  {m.has_media && m.media_mime?.startsWith("image/") && (
                    <a className="msg-media" href={`/api/messages/media/${m.id}`} target="_blank" rel="noreferrer">
                      <img src={`/api/messages/media/${m.id}`} alt="" loading="lazy" />
                    </a>
                  )}
                  {m.has_media && !m.media_mime?.startsWith("image/") && (
                    <a className="msg-file" href={`/api/messages/media/${m.id}`} target="_blank" rel="noreferrer">
                      <Icon n="info" size={16} /><span>{m.media_name || "File"}</span>
                    </a>
                  )}
                  {m.poll_data && (
                    <div className="msg-poll">
                      <p className="poll-q">{m.poll_data.question}</p>
                      {m.poll_data.options.map((opt, i) => {
                        const votes = Object.values(m.poll_data!.votes || {});
                        const count = votes.filter((v) => v === i).length;
                        const total = votes.length;
                        const pct = total ? Math.round((count / total) * 100) : 0;
                        return (
                          <button key={i} type="button" className="poll-opt"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.dispatchEvent(new CustomEvent("poll-vote", { detail: { id: m.id, option: i } }));
                            }}>
                            <i style={{ width: `${pct}%` }} />
                            <span>{opt}</span>
                            {total > 0 && <em>{pct}%</em>}
                          </button>
                        );
                      })}
                      {Object.keys(m.poll_data.votes || {}).length > 0 && (
                        <small className="poll-n">{Object.keys(m.poll_data.votes).length} suara</small>
                      )}
                    </div>
                  )}
                  {!!m.body && !m.poll_data && <span className="cap"><Rich body={m.body} mentions={m.mentions} me={meUsername} /></span>}
                </>}
          </span>
          {!!m.pinned_at && !gone && <span className="pin-badge">Disematkan</span>}
          <span className="foot">
            <small>{clock(m.created_at)}</small>
            {mine && !gone && (
              m.status === "sending" ? <span className="st sending" title="Mengirim"><Icon n="clock" size={12} /></span>
              : m.status === "failed" ? <button className="st failed" onClick={() => onRetry(m)}><Icon n="alert" size={13} />Gagal, ulangi</button>
              : readBlue
                ? <span className="st ok read" title="Dibaca"><Icon n="checks" size={14} /></span>
                : <span className="st ok" title="Terkirim"><Icon n="check" size={13} /></span>
            )}
          </span>
          {reactions && (
            <button type="button" className="react-chips" aria-label={`${total} reaksi, ketuk untuk melihat`}
              onClick={(e) => { e.stopPropagation(); onShowReactions?.(m); }}>
              {reactions.slice(0, 3).map((r) => <span key={r.e} className={r.e === myEmoji ? "mine" : ""}>{r.e}</span>)}
              {total > 1 && <em>{total}</em>}
            </button>
          )}
          {m.status !== "sending" && (
            <button className="chev" aria-label="Menu pesan"
              onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onMenu(m, r.right - 200, r.bottom + 4); }}>
              <Icon n="down" size={16} />
            </button>
          )}
        </div>
        {canReact && (
          <button type="button" className="react-btn" aria-label="Beri reaksi"
            onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onReact!(m, mine ? r.right - 280 : r.left, r.bottom + 6); }}>
            <Icon n="smile" size={18} />
          </button>
        )}
      </div>
    </div>
  );
});
