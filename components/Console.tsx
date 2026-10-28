"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { COMMUNITY_ID } from "@/lib/mentions";
import { Dialog, type DialogAction } from "./overlays";
import { Avatar, Icon, RoleBadge, VerifiedBadge, DEFAULT_ROLE_LABELS, type Me, type RoleLabels } from "./ui";

type AUser = {
  id: string; username: string | null; name: string | null; avatar_url: string | null; role: string; email: string | null;
  banned: boolean; ban_reason: string | null; muted_until: string | null; created_at: string;
  has_password: boolean; kicked: boolean; root: boolean; can_manage: boolean;
};
type Stats = { total: number; banned: number; muted: number; owners: number; admins: number };
type Grp = { id: string; kind: string; title: string | null; creator: string | null; member_count: number };
type GMember = { id: string; username: string; name: string | null; avatar_url: string | null; role: string; sys_role: string; banned: boolean };
type Log = { id: number; actor_name: string; action: string; target_name: string | null; detail: string | null; created_at: string };

const ACTIONS: Record<string, string> = {
  ban: "memblokir", unban: "membuka blokir", mute: "membisukan", unmute: "membuka bisu", kick: "mengeluarkan",
  rejoin: "mengizinkan kembali", reset_password: "mereset password", delete_message: "menghapus pesan dari",
  delete_group: "menghapus grup", "role:owner": "menjadikan owner", "role:admin": "menjadikan admin", "role:user": "menjadikan user biasa",
  reset_messages: "mereset semua pesan", reset_chats: "mereset chat", reset_all: "mereset data penuh",
};
const MUTES = [[10, "10 menit"], [60, "1 jam"], [1440, "1 hari"], [10080, "7 hari"]] as const;

async function call(url: string, init?: RequestInit): Promise<{ ok: boolean; data: any }> {
  try {
    const r = await fetch(url, init);
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, data };
  } catch { return { ok: false, data: { error: "Jaringan bermasalah, coba lagi" } }; }
}
const postJson = (url: string, body: object) => call(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const when = (d: string) => new Date(d).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const isMuted = (u: AUser) => !!u.muted_until && new Date(u.muted_until) > new Date();

export default function Console({ me, onClose, onToast, onChanged }: {
  me: Me; onClose: () => void; onToast: (t: string) => void; onChanged: () => void;
}) {
  const owner = me.role === "owner";
  const [tab, setTab] = useState<"users" | "groups" | "logs" | "system">("users");
  const [dialog, setDialog] = useState<{ title: string; text?: string; actions: DialogAction[] } | null>(null);
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [roleLabels, setRoleLabels] = useState<RoleLabels>(DEFAULT_ROLE_LABELS);
  const [labelEdit, setLabelEdit] = useState<RoleLabels>(DEFAULT_ROLE_LABELS);
  const [titleDraft, setTitleDraft] = useState("");


  // ---------- pengguna ----------
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "staff" | "banned" | "muted">("all");
  const [users, setUsers] = useState<AUser[]>([]);
  const [more, setMore] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [mins, setMins] = useState<number>(60);
  const [grantOpen, setGrantOpen] = useState(false);
  const [gEmail, setGEmail] = useState("");
  const [gRole, setGRole] = useState<"admin" | "owner">("admin");
  const reqId = useRef(0);

  const loadUsers = useCallback(async (append = false, offset = 0) => {
    const id = ++reqId.current;
    setLoading(true);
    const { ok, data } = await call(`/api/admin/users?q=${encodeURIComponent(q)}&filter=${filter}&offset=${offset}`);
    if (id !== reqId.current) return;
    setLoading(false);
    if (!ok) { onToast(data?.error || "Gagal memuat pengguna"); return; }
    setUsers((l) => (append ? [...l, ...data.users] : data.users));
    setMore(!!data.more); setStats(data.stats);
  }, [q, filter, onToast]);

  useEffect(() => {
    if (tab !== "users") return;
    const t = setTimeout(() => loadUsers(false, 0), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [tab, q, filter, loadUsers]);

  async function act(body: object, okText: string) {
    const { ok, data } = await postJson("/api/admin/users", body);
    onToast(ok ? okText : data?.error || "Gagal");
    if (ok) { await loadUsers(false, 0); onChanged(); }
    return ok;
  }

  const ask = (title: string, text: string, label: string, run: () => void, danger = true) =>
    setDialog({ title, text, actions: [{ label, danger, run }] });

  async function kickCommunity(u: AUser) {
    const { ok, data } = await call(`/api/members?conversationId=${COMMUNITY_ID}&userId=${encodeURIComponent(u.id)}`, { method: "DELETE" });
    onToast(ok ? "Dikeluarkan dari Komunitas" : data?.error || "Gagal");
    if (ok) { await loadUsers(false, 0); onChanged(); }
  }

  // ---------- grup ----------
  const [groups, setGroups] = useState<Grp[] | null>(null);
  const [gSel, setGSel] = useState<string | null>(null);
  const [gMembers, setGMembers] = useState<GMember[]>([]);
  const [gq, setGq] = useState("");

  const loadGroups = useCallback(async () => {
    const { ok, data } = await call("/api/admin/conversations");
    if (ok) setGroups(data); else onToast(data?.error || "Gagal memuat grup");
  }, [onToast]);
  const loadGMembers = useCallback(async (id: string) => {
    setGMembers([]);
    const { ok, data } = await call(`/api/admin/conversations?id=${id}`);
    if (ok) setGMembers(data);
  }, []);
  useEffect(() => { if (tab === "groups" && !groups) loadGroups(); }, [tab, groups, loadGroups]);
  useEffect(() => { if (gSel) loadGMembers(gSel); }, [gSel, loadGMembers]);

  async function kickFrom(cid: string, u: GMember) {
    const { ok, data } = await call(`/api/members?conversationId=${cid}&userId=${encodeURIComponent(u.id)}`, { method: "DELETE" });
    onToast(ok ? `@${u.username} dikeluarkan` : data?.error || "Gagal");
    if (ok) { loadGMembers(cid); loadGroups(); onChanged(); }
  }
  async function deleteGroup(g: Grp) {
    const { ok, data } = await call(`/api/admin/conversations?id=${g.id}`, { method: "DELETE" });
    onToast(ok ? "Grup dihapus" : data?.error || "Gagal");
    if (ok) { setGSel(null); loadGroups(); onChanged(); }
  }

  // ---------- log ----------
  const [logs, setLogs] = useState<Log[] | null>(null);
  const [logMore, setLogMore] = useState(false);
  const loadLogs = useCallback(async (before?: number) => {
    const { ok, data } = await call(`/api/admin/logs${before ? `?before=${before}` : ""}`);
    if (!ok) { onToast("Gagal memuat log"); return; }
    setLogs((l) => (before && l ? [...l, ...data] : data));
    setLogMore(data.length >= 60);
  }, [onToast]);
  useEffect(() => { if (tab === "logs") loadLogs(); }, [tab, loadLogs]);

  useEffect(() => {
    fetch("/api/settings").then(r => r.ok ? r.json() : null).then(d => {
      if (!d) return;
      const L = { owner: d.owner || "Owner", admin: d.admin || "Admin", user: d.user || "Member" };
      setRoleLabels(L); setLabelEdit(L);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !dialog && !(e.target instanceof HTMLInputElement)) onClose(); };

    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose, dialog]);

  const gList = (groups ?? []).filter((g) => !gq.trim() || (g.title ?? "").toLowerCase().includes(gq.trim().toLowerCase()));
  const curGroup = groups?.find((g) => g.id === gSel) ?? null;

  return (
    <section className="console" aria-label="Console">
      <header className="console-bar">
        <button className="icon-btn" onClick={onClose} aria-label="Tutup console"><Icon n="back" /></button>
        <div><strong>Console</strong><small>{owner ? "Owner" : "Admin"} · @{me.username}</small></div>
      </header>

      <div className="console-body">
        {stats && (
          <div className="stat-row">
            <span><b>{stats.total}</b>pengguna</span>
            <span><b>{stats.owners}</b>owner</span>
            <span><b>{stats.admins}</b>admin</span>
            <span><b>{stats.banned}</b>diblokir</span>
            <span><b>{stats.muted}</b>dibisukan</span>
          </div>
        )}

        <div className="tabs">
          {([["users", "Pengguna"], ["groups", "Grup"], ["logs", "Log"], ...(owner ? [["system", "Sistem"] as const] : [])] as const).map(([k, l]) => (
            <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>

        {tab === "users" && (
          <>
            <div className="console-tools">
              <div className="search"><Icon n="search" size={18} /><input placeholder={owner ? "Cari username, nama, atau email" : "Cari username atau nama"} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari pengguna" /></div>
              <select className="field sel" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Filter">
                <option value="all">Semua</option><option value="staff">Staf</option><option value="banned">Diblokir</option><option value="muted">Dibisukan</option>
              </select>
            </div>

            {owner && (
              <div className="grant">
                <button className="link" onClick={() => setGrantOpen((o) => !o)}><Icon n="key" size={16} /> Tambah owner / admin lewat email</button>
                {grantOpen && (
                  <div className="grant-form">
                    <input className="field" type="email" placeholder="email@contoh.com" value={gEmail} onChange={(e) => setGEmail(e.target.value)} />
                    <select className="field sel" value={gRole} onChange={(e) => setGRole(e.target.value as "admin" | "owner")}>
                      <option value="admin">Admin</option><option value="owner">Owner</option>
                    </select>
                    <button className="primary" disabled={!/^\S+@\S+\.\S+$/.test(gEmail)}
                      onClick={() => ask(`Tambah ${gRole}?`, `${gEmail} akan menjadi ${gRole}${gRole === "owner" ? " dengan akses console penuh" : ""} begitu mereka masuk/mendaftar.`, "Tambahkan",
                        async () => { if (await act({ action: "grant", email: gEmail.trim().toLowerCase(), role: gRole }, `${gEmail} ditambahkan sebagai ${gRole}`)) { setGEmail(""); setGrantOpen(false); } }, false)}>
                      Tambahkan
                    </button>
                  </div>
                )}
              </div>
            )}

            <ul className="clist">
              {!loading && users.length === 0 && <li className="empty">Tidak ada pengguna.</li>}
              {users.map((u) => {
                const open = sel === u.id;
                const label = u.username ? `@${u.username}` : "(belum daftar)";
                return (
                  <li key={u.id} className={`crow${open ? " open" : ""}`}>
                    <button className="crow-head" onClick={() => setSel(open ? null : u.id)} aria-expanded={open}>
                      <Avatar name={u.name || u.username || "?"} src={u.avatar_url} size={40} />
                      <span className="meta">
                        <b>{u.name || u.username || "Tanpa nama"} <RoleBadge role={u.role} title={(u as any).role_title} labels={roleLabels} />{(u as any).verified && <VerifiedBadge />}
                          {u.banned && <em className="badge warn">diblokir</em>}
                          {isMuted(u) && <em className="badge warn">bisu</em>}
                          {u.kicked && <em className="badge warn">kick</em>}</b>
                        <small>{label}{u.email ? ` · ${u.email}` : ""}</small>
                      </span>
                    </button>

                    {open && (
                      <div className="cdetail">
                        <p className="muted small">
                          Daftar {when(u.created_at)} · {u.has_password ? "sudah punya password" : "belum membuat password"}
                          {u.banned && u.ban_reason ? ` · alasan blokir: ${u.ban_reason}` : ""}
                          {isMuted(u) && u.muted_until ? ` · bisu sampai ${when(u.muted_until)}` : ""}
                        </p>
                        {!u.can_manage ? (
                          <p className="muted small">{u.root ? "Owner utama tidak bisa diubah." : u.id === me.id ? "Ini akun kamu." : "Kamu tidak punya akses untuk menindak akun ini."}</p>
                        ) : (
                          <>
                            <div className="crow-act">
                              {u.banned ? (
                                <button onClick={() => act({ action: "unban", userId: u.id }, "Blokir dibuka")}>Buka blokir</button>
                              ) : (
                                <>
                                  <input className="field" placeholder="Alasan blokir (opsional)" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
                                  <button className="danger" onClick={() => ask(`Blokir ${label}?`, "Akun langsung keluar dan tidak bisa masuk lagi sampai blokir dibuka.", "Blokir akun",
                                    async () => { if (await act({ action: "ban", userId: u.id, reason: reason.trim() || undefined }, "Akun diblokir")) setReason(""); })}>Blokir (ban)</button>
                                </>
                              )}
                            </div>
                            <div className="crow-act">
                              {isMuted(u) ? (
                                <button onClick={() => act({ action: "unmute", userId: u.id }, "Bisu dibuka")}>Buka bisu</button>
                              ) : (
                                <>
                                  <select className="field sel" value={mins} onChange={(e) => setMins(Number(e.target.value))} aria-label="Durasi bisu">
                                    {MUTES.map(([m, l]) => <option key={m} value={m}>{l}</option>)}
                                  </select>
                                  <button onClick={() => act({ action: "mute", userId: u.id, minutes: mins }, "Pengguna dibisukan")}>Bisukan</button>
                                </>
                              )}
                            </div>
                            <div className="crow-act">
                              {u.kicked ? (
                                <button onClick={() => act({ action: "rejoin", userId: u.id }, "Diizinkan kembali ke Komunitas")}>Izinkan kembali ke Komunitas</button>
                              ) : (
                                <button disabled={!u.username} onClick={() => ask(`Keluarkan ${label} dari Komunitas?`, "Mereka tidak akan masuk Komunitas lagi sampai kamu mengizinkan kembali.", "Kick", () => kickCommunity(u))}>Kick dari Komunitas</button>
                              )}
                            </div>
                            {owner && (
                              <div className="crow-act wrap">
                                <div className="title-edit">
                                  <label className="muted small">Sebutan role (custom per orang)</label>
                                  <div className="title-row">
                                    <input className="field" id={`title-${u.id}`} placeholder={u.role === "owner" ? roleLabels.owner : u.role === "admin" ? roleLabels.admin : roleLabels.user}
                                      maxLength={24} defaultValue={(u as any).role_title || ""} />
                                    <button type="button" onClick={() => {
                                      const el = document.getElementById(`title-${u.id}`) as HTMLInputElement | null;
                                      const v = (el?.value || "").trim();
                                      act({ action: "title", userId: u.id, title: v }, v ? `Sebutan: ${v}` : "Sebutan dihapus");
                                    }}>Simpan</button>
                                  </div>
                                </div>
                                {u.role !== "owner" && <button onClick={() => act({ action: "verify", userId: u.id, verified: !(u as any).verified }, (u as any).verified ? "Centang biru dicabut" : "Centang biru diberikan")}>{(u as any).verified ? "Cabut centang biru" : "Beri centang biru"}</button>}
                                {u.role !== "admin" && <button onClick={() => act({ action: "role", userId: u.id, role: "admin" }, `Dijadikan ${roleLabels.admin}`)}>Jadikan {roleLabels.admin}</button>}
                                {u.role !== "owner" && <button onClick={() => ask(`Jadikan ${label} ${roleLabels.owner}?`, `${roleLabels.owner} punya console penuh: kick, ban, ubah role, tambah ${roleLabels.owner} lain.`, `Jadikan ${roleLabels.owner}`, () => act({ action: "role", userId: u.id, role: "owner" }, `Dijadikan ${roleLabels.owner}`), false)}>Jadikan {roleLabels.owner}</button>}
                                {u.role !== "user" && <button onClick={() => act({ action: "role", userId: u.id, role: "user" }, "Role dicabut")}>Jadikan {roleLabels.user}</button>}
                                <button className="danger" onClick={() => ask(`Reset password ${label}?`, "Password dihapus. Mereka diminta membuat password baru saat membuka aplikasi lagi.", "Reset password", () => act({ action: "reset_password", userId: u.id }, "Password direset"))}>Reset password</button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
              {loading && <li className="empty">Memuat…</li>}
              {more && !loading && <li><button className="older" onClick={() => loadUsers(true, users.length)}>Muat lebih banyak</button></li>}
            </ul>
          </>
        )}

        {tab === "groups" && (
          <>
            {!curGroup ? (
              <>
                <div className="console-tools"><div className="search"><Icon n="search" size={18} /><input placeholder="Cari grup" value={gq} onChange={(e) => setGq(e.target.value)} aria-label="Cari grup" /></div></div>
                <ul className="clist">
                  {groups === null && <li className="empty">Memuat…</li>}
                  {groups !== null && gList.length === 0 && <li className="empty">Tidak ada grup.</li>}
                  {gList.map((g) => (
                    <li key={g.id} className="crow">
                      <button className="crow-head" onClick={() => setGSel(g.id)}>
                        <Avatar name={g.title || "Grup"} kind={g.kind} size={40} />
                        <span className="meta"><b>{g.title || "Grup"}</b><small>{g.member_count} anggota{g.creator ? ` · dibuat @${g.creator}` : ""}</small></span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <div className="console-tools">
                  <button className="link" onClick={() => setGSel(null)}><Icon n="back" size={16} /> Semua grup</button>
                  {owner && curGroup.kind === "group" && (
                    <button className="link danger" onClick={() => ask(`Hapus grup “${curGroup.title}”?`, "Grup dan semua pesannya dihapus permanen untuk semua anggota.", "Hapus grup", () => deleteGroup(curGroup))}>Hapus grup</button>
                  )}
                </div>
                <h4 className="ctitle">{curGroup.title} · {gMembers.length} anggota</h4>
                <ul className="clist">
                  {gMembers.map((u) => {
                    const canKick = u.id !== me.id && (owner ? u.sys_role !== "owner" : u.sys_role === "user");
                    return (
                      <li key={u.id} className="crow">
                        <div className="crow-head static">
                          <Avatar name={u.name || u.username} src={u.avatar_url} size={40} />
                          <span className="meta"><b>{u.name || u.username} <RoleBadge role={u.role} title={(u as any).role_title} labels={roleLabels} />{(u as any).verified && <VerifiedBadge />}{u.banned && <em className="badge warn">diblokir</em>}</b><small>@{u.username}</small></span>
                          {canKick && <button className="link danger" onClick={() => ask(`Keluarkan @${u.username}?`, `Dikeluarkan dari “${curGroup.title}”.`, "Kick", () => kickFrom(curGroup.id, u))}>Kick</button>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </>
        )}

        {tab === "logs" && (
          <ul className="clist logs">
            {logs === null && <li className="empty">Memuat…</li>}
            {logs !== null && logs.length === 0 && <li className="empty">Belum ada tindakan moderasi.</li>}
            {(logs ?? []).map((l) => (
              <li key={l.id}>
                <span><b>{l.actor_name}</b> {ACTIONS[l.action] ?? l.action}{l.target_name ? <> <b>{l.target_name}</b></> : null}{l.detail ? <em> · {l.detail}</em> : null}</span>
                <small>{when(l.created_at)}</small>
              </li>
            ))}
            {logMore && logs && <li><button className="older" onClick={() => loadLogs(logs[logs.length - 1].id)}>Muat lebih banyak</button></li>}
          </ul>
        )}

        {tab === "system" && owner && (
          <div className="sys-panel">
            <h4 className="ctitle">Nama role (sebutan)</h4>
            <p className="muted small">Ganti sebutan di seluruh app. Hak akses tetap: owner &gt; admin &gt; member.</p>
            <div className="label-grid">
              <label>Owner<input className="field" maxLength={24} value={labelEdit.owner} onChange={(e) => setLabelEdit((x) => ({ ...x, owner: e.target.value }))} /></label>
              <label>Admin<input className="field" maxLength={24} value={labelEdit.admin} onChange={(e) => setLabelEdit((x) => ({ ...x, admin: e.target.value }))} /></label>
              <label>Member<input className="field" maxLength={24} value={labelEdit.user} onChange={(e) => setLabelEdit((x) => ({ ...x, user: e.target.value }))} /></label>
            </div>
            <button className="primary" style={{ marginTop: 10 }}
              onClick={async () => {
                const r = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ owner: labelEdit.owner.trim(), admin: labelEdit.admin.trim(), user: labelEdit.user.trim() }) });
                const d = await r.json().catch(() => ({}));
                if (r.ok) {
                  setRoleLabels({ owner: d.owner, admin: d.admin, user: d.user });
                  onToast("Nama role disimpan");
                } else onToast(d.error || "Gagal");
              }}>Simpan nama role</button>

            <h4 className="ctitle" style={{ marginTop: 28 }}>Reset data</h4>
            <p className="muted small">Tindakan permanen. Ketik <b>RESET</b> lalu pilih cakupan. Komunitas Kevsoft tidak dihapus strukturnya.</p>
            <input
              className="field"
              placeholder="Ketik RESET untuk mengonfirmasi"
              value={resetConfirm}
              onChange={(e) => setResetConfirm(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            <div className="crow-act wrap" style={{ marginTop: 12 }}>
              <button
                className="danger"
                disabled={resetBusy || resetConfirm !== "RESET"}
                onClick={() => ask(
                  "Hapus SEMUA pesan?",
                  "Semua pesan di semua chat (termasuk Komunitas) dihapus permanen. Chat & anggota tetap ada.",
                  "Hapus semua pesan",
                  async () => {
                    setResetBusy(true);
                    const { ok, data } = await postJson("/api/admin/reset", { scope: "messages", confirm: "RESET" });
                    setResetBusy(false);
                    onToast(ok ? "Semua pesan dihapus" : data?.error || "Gagal");
                    if (ok) { setResetConfirm(""); onChanged(); }
                  },
                )}
              >Hapus semua pesan</button>
              <button
                className="danger"
                disabled={resetBusy || resetConfirm !== "RESET"}
                onClick={() => ask(
                  "Hapus semua chat?",
                  "Semua DM, grup, dan pesan di dalamnya dihapus. Komunitas dikosongkan tapi tetap ada.",
                  "Hapus chat",
                  async () => {
                    setResetBusy(true);
                    const { ok, data } = await postJson("/api/admin/reset", { scope: "chats", confirm: "RESET" });
                    setResetBusy(false);
                    onToast(ok ? "Semua chat dihapus" : data?.error || "Gagal");
                    if (ok) { setResetConfirm(""); onChanged(); }
                  },
                )}
              >Hapus DM & grup</button>
              <button
                className="danger"
                disabled={resetBusy || resetConfirm !== "RESET"}
                onClick={() => ask(
                  "RESET DATA PENUH?",
                  "Pesan, DM, grup, chat AI dihapus. Komunitas dikosongkan dan semua user dimasukkan ulang. Akun pengguna tetap.",
                  "Reset semua data",
                  async () => {
                    setResetBusy(true);
                    const { ok, data } = await postJson("/api/admin/reset", { scope: "all", confirm: "RESET" });
                    setResetBusy(false);
                    onToast(ok ? "Data di-reset penuh" : data?.error || "Gagal");
                    if (ok) { setResetConfirm(""); onChanged(); }
                  },
                )}
              >Reset semua data</button>
            </div>
            <p className="muted small" style={{ marginTop: 16 }}>
              Setelah reset, minta semua user me-refresh halaman. Pesan sementara (disappearing) diatur per chat dari Info chat.
            </p>
          </div>
        )}
      </div>

      {dialog && <Dialog title={dialog.title} text={dialog.text} actions={dialog.actions} onClose={() => setDialog(null)} />}
    </section>
  );
}
