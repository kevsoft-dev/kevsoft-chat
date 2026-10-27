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

export default function PublicProfile({ user, isMe, meUsername }: { user: U; isMe: boolean; meUsername: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");

  const joined = new Date(user.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

  async function startChat() {
    if (isMe) { router.push("/"); return; }
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "dm", username: user.username.toLowerCase() }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(d.error || "Gagal membuka chat"); setBusy(false); return; }
      // Buka chat langsung lewat deep link /@username
      router.push(`/@${user.username}`);
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

  async function saveContact() {
    const lines = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      `FN:${user.name || user.username}`,
      `N:${user.name || user.username};;;;`,
      `NICKNAME:${user.username}`,
      user.bio ? `NOTE:${user.bio.replace(/\n/g, "\\n")}` : "",
      "END:VCARD",
    ].filter(Boolean).join("\n");
    try {
      await navigator.clipboard.writeText(lines);
      setToast("Kontak disalin (vCard)");
      setTimeout(() => setToast(""), 1800);
    } catch {
      setToast("Gagal menyalin");
      setTimeout(() => setToast(""), 1500);
    }
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
        <button className="icon-btn" onClick={() => router.push("/")} aria-label="Kembali">
          <Icon n="back" />
        </button>
        <strong>Profil</strong>
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
          <p className="muted small" style={{ marginTop: 8 }}>Bergabung {joined}</p>
        </div>

        <div className="info-contact-actions">
          {!isMe ? (
            <button type="button" className="primary-act" disabled={busy} onClick={startChat}>
              <Icon n="chat" size={18} />{busy ? "Membuka…" : "Chat pribadi"}
            </button>
          ) : (
            <button type="button" onClick={() => router.push("/")}>
              <Icon n="user" size={18} />Ini kamu · buka pengaturan di beranda
            </button>
          )}
          <button type="button" onClick={copyUser}>
            <Icon n="copy" size={18} />Salin username
          </button>
          {!isMe && (
            <button type="button" onClick={saveContact}>
              <Icon n="user" size={18} />Simpan kontak
            </button>
          )}
          <button type="button" onClick={shareLink}>
            <Icon n="copy" size={18} />Salin link profil
          </button>
        </div>

        {err && <p className="error" style={{ textAlign: "center", padding: 12 }}>{err}</p>}
        {meUsername && (
          <p className="muted small" style={{ textAlign: "center", padding: "8px 16px 24px" }}>
            Link chat langsung: <code>/@{user.username}</code>
          </p>
        )}
      </div>

      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}
