"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar, Icon, RoleBadge } from "./ui";

type U = {
  id: string;
  username: string;
  name: string;
  avatar_url: string | null;
  bio: string | null;
  role: string;
  created_at: string;
};

export default function PublicProfile({
  user,
  isMe,
  meUsername,
  loggedIn = false,
  fromDm = false,
}: {
  user: U;
  isMe: boolean;
  meUsername: string;
  loggedIn?: boolean;
  fromDm?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");

  const joined = new Date(user.created_at).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  async function startChat() {
    if (isMe) {
      router.push("/");
      return;
    }
    // Belum login → ke sign-in, setelah masuk kembali ke /dm/username
    if (!loggedIn) {
      const next = `/dm/${encodeURIComponent(user.username)}`;
      router.push(`/sign-in?next=${encodeURIComponent(next)}`);
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "dm", username: user.username.toLowerCase() }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(d.error || "Gagal membuka chat");
        setBusy(false);
        return;
      }
      router.push(`/dm/${user.username}`);
    } catch {
      setErr("Jaringan bermasalah");
      setBusy(false);
    }
  }

  async function copyUser() {
    try {
      await navigator.clipboard.writeText("@" + user.username);
      setToast("Username disalin");
      setTimeout(() => setToast(""), 1500);
    } catch {}
  }

  function shareLink() {
    const url = `${typeof window !== "undefined" ? window.location.origin : ""}/${user.username}`;
    if (navigator.share) {
      navigator.share({ title: user.name, text: `@${user.username} di kevsoft-chat`, url }).catch(() => copyLink(url));
    } else copyLink(url);
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setToast("Link profil disalin");
      setTimeout(() => setToast(""), 1500);
    } catch {}
  }

  return (
    <main className="pub-profile">
      <header className="pub-bar">
        <button
          className="icon-btn"
          onClick={() => router.push(loggedIn ? "/" : "/sign-in")}
          aria-label="Kembali"
        >
          <Icon n="back" />
        </button>
        <strong>{fromDm && !loggedIn ? "Chat" : "Profil"}</strong>
        <button className="icon-btn" onClick={shareLink} aria-label="Bagikan">
          <Icon n="copy" />
        </button>
      </header>

      <div className="pub-body">
        <div className="info-hero">
          <Avatar name={user.name} src={user.avatar_url} size={120} />
          <h1>{user.name}</h1>
          <p className="muted">@{user.username}</p>
          {user.bio && <p className="desc">{user.bio}</p>}
          <div className="contact-badges">
            <RoleBadge role={user.role} />
          </div>
          <p className="muted small" style={{ marginTop: 8 }}>
            Bergabung {joined}
          </p>
        </div>

        <div className="info-contact-actions">
          {!isMe ? (
            <button type="button" className="primary-act" disabled={busy} onClick={startChat}>
              <Icon n="chat" size={18} />
              {busy ? "Membuka…" : loggedIn ? "Chat sekarang" : "Chat now — login dulu"}
            </button>
          ) : (
            <button type="button" onClick={() => router.push("/")}>
              <Icon n="user" size={18} />
              Ini kamu · buka beranda
            </button>
          )}
          <button type="button" onClick={copyUser}>
            <Icon n="copy" size={18} />
            Salin username
          </button>
          <button type="button" onClick={shareLink}>
            <Icon n="copy" size={18} />
            Salin link profil
          </button>
        </div>

        {!loggedIn && (
          <p className="muted small" style={{ textAlign: "center", padding: "8px 20px 24px" }}>
            Kamu bisa melihat profil ini tanpa akun. Untuk mengirim pesan,{" "}
            <button type="button" className="link" style={{ display: "inline", padding: 0, border: 0, background: "none", color: "var(--accent-text)", cursor: "pointer" }} onClick={startChat}>
              login / daftar
            </button>
            .
          </p>
        )}

        {err && (
          <p className="error" style={{ textAlign: "center", padding: 12 }}>
            {err}
          </p>
        )}
        {loggedIn && meUsername && (
          <p className="muted small" style={{ textAlign: "center", padding: "8px 16px 24px" }}>
            Link chat: <code>/@{user.username}</code>
          </p>
        )}
      </div>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </main>
  );
}
