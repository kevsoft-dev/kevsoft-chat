"use client";
import { useCallback, useEffect, useState } from "react";

type Acc = { email: string; status: "pending" | "approved" | "rejected" | "revoked"; note: string | null; requested_at: string; decided_at: string | null };
type Rm = { id: string; name: string; topic: string | null; locked: boolean; ttl: number | null; created_at: string; messages: number };
type Log = { id: number; actor: string; action: string; target: string | null; detail: string | null; at: string };
type Data = {
  me: string; lockdown: boolean; online: number;
  stats: { pending: number; approved: number; rejected: number; revoked: number; rooms: number; messages: number; messages_24h: number };
  access: Acc[]; rooms: Rm[]; logs: Log[];
};
type Tab = "overview" | "requests" | "access" | "rooms" | "audit";

const TTL: [number, string][] = [[0, "permanen"], [60, "1 menit"], [3600, "1 jam"], [86400, "1 hari"], [604800, "7 hari"]];
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }) : "-");
const ACTION: Record<string, string> = {
  request: "meminta akses", approve: "menyetujui", reject: "menolak", revoke: "mencabut", remove: "menghapus", add: "menambah email",
  room_create: "membuat room", room_update: "mengubah room", room_purge: "mengosongkan room", room_delete: "menghapus room",
  message_delete: "menghapus pesan", lockdown_on: "LOCKDOWN aktif", lockdown_off: "lockdown dimatikan", wipe_all: "menghapus semua pesan", clear_logs: "membersihkan audit",
};

async function post(body: object): Promise<{ ok: boolean; error?: string; data?: any }> {
  try {
    const r = await fetch("/api/ghosh/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    return r.ok ? { ok: true, data: d } : { ok: false, error: d.error || `Gagal (${r.status})` };
  } catch { return { ok: false, error: "Koneksi terputus" }; }
}

export default function GhConsole() {
  const [d, setD] = useState<Data | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [err, setErr] = useState("");
  const [flash, setFlash] = useState("");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | Acc["status"]>("all");
  const [email, setEmail] = useState(""); const [note, setNote] = useState("");
  const [rn, setRn] = useState(""); const [rt, setRt] = useState(""); const [rttl, setRttl] = useState(0);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/ghosh/admin", { cache: "no-store" });
      if (!r.ok) { setErr(r.status === 404 ? "Tidak diizinkan" : `Gagal memuat (${r.status})`); return; }
      setD(await r.json()); setErr("");
    } catch { setErr("Koneksi terputus"); }
  }, []);
  useEffect(() => { load(); const t = setInterval(() => { if (!document.hidden) load(); }, 8000); return () => clearInterval(t); }, [load]);

  const say = (t: string) => { setFlash(t); setTimeout(() => setFlash(""), 2600); };
  async function act(body: object, okMsg: string, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return false;
    const r = await post(body);
    if (r.ok) { say(okMsg); load(); } else say(r.error || "Gagal");
    return r.ok;
  }

  if (err && !d) return <div className="gh"><header className="gh-top"><span className="gh-logo">CONSOLE</span></header><main className="gh-gate"><div className="gh-card"><div className="gh-err">{err}</div><a className="gh-link" href="/">← kembali</a></div></main></div>;
  if (!d) return <div className="gh"><header className="gh-top"><span className="gh-logo">CONSOLE</span></header><div className="gh-boot">memuat<span className="gh-caret" /></div></div>;

  const pending = d.access.filter((a) => a.status === "pending");
  const list = d.access.filter((a) => (filter === "all" || a.status === filter) && a.email.includes(q.trim().toLowerCase()));
  const TABS: [Tab, string][] = [["overview", "ringkasan"], ["requests", `permintaan${pending.length ? ` (${pending.length})` : ""}`], ["access", "akses"], ["rooms", "room"], ["audit", "audit"]];

  return (
    <div className="gh">
      <header className="gh-top">
        <span className="gh-logo">KEVSOFT-CHAT <span className="gh-dim">/ CONSOLE</span></span>
        <span className="gh-status">{d.lockdown ? "LOCKDOWN" : `${d.online} Unknown online`}</span>
      </header>
      <nav className="gc-tabs">
        {TABS.map(([k, l]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}
        <a href="/ghosh">buka ruang →</a>
      </nav>
      {flash && <div className="gc-flash">{flash}</div>}

      <main className="gc-body">
        {tab === "overview" && (
          <>
            <div className="gc-stats">
              {([["menunggu", d.stats.pending], ["disetujui", d.stats.approved], ["ditolak", d.stats.rejected], ["dicabut", d.stats.revoked], ["room", d.stats.rooms], ["pesan aktif", d.stats.messages], ["pesan 24 jam", d.stats.messages_24h], ["online", d.online]] as [string, number][]).map(([l, v]) => (
                <div key={l} className="gc-stat"><b>{v}</b><span>{l}</span></div>
              ))}
            </div>
            <div className="gc-panel">
              <h3>Lockdown</h3>
              <p className="gh-dim">Memblokir semua orang kecuali owner utama, langsung berlaku di setiap permintaan. Data tidak dihapus.</p>
              <button className={`gh-btn${d.lockdown ? "" : " danger"}`} onClick={() => act({ action: "lockdown", on: !d.lockdown }, d.lockdown ? "Lockdown dimatikan" : "Lockdown aktif", d.lockdown ? undefined : "Aktifkan lockdown? Semua anggota langsung dikeluarkan sementara.")}>
                {d.lockdown ? "matikan lockdown" : "aktifkan lockdown"}
              </button>
            </div>
            <div className="gc-panel">
              <h3>Perlindungan aktif</h3>
              <ul className="gc-list">
                <li>Pesan dienkripsi AES-256-GCM di database; pengirim hanya disimpan sebagai HMAC.</li>
                <li>Semua pengirim tampil “Unknown”. Tidak ada username, email, atau foto di respons.</li>
                <li>Akses dicek ke database di setiap permintaan, jadi pencabutan berlaku seketika.</li>
                <li>Hanya {d.me} yang bisa membuat room, menyetujui akses, dan membuka console ini.</li>
                <li>Rate limit, noindex, no-referrer, no-store, dan layar disamarkan saat tab tidak aktif.</li>
              </ul>
            </div>
            <div className="gc-panel">
              <h3>Zona bahaya</h3>
              <button className="gh-btn danger" onClick={() => { const c = window.prompt("Ketik WIPE untuk menghapus SEMUA pesan di semua room:"); if (c !== null) act({ action: "wipe_all", confirm: c }, "Semua pesan dihapus"); }}>hapus semua pesan</button>
            </div>
          </>
        )}

        {tab === "requests" && (
          <div className="gc-panel">
            <h3>Permintaan akses ({pending.length})</h3>
            {!pending.length && <p className="gh-dim">// tidak ada permintaan.</p>}
            {pending.map((a) => (
              <div className="gc-row" key={a.email}>
                <div className="gc-main"><b>{a.email}</b><span className="gh-dim">{when(a.requested_at)}{a.note ? ` · “${a.note}”` : ""}</span></div>
                <button className="gh-btn" onClick={() => act({ action: "approve", email: a.email }, "Disetujui")}>acc</button>
                <button className="gh-btn danger" onClick={() => act({ action: "reject", email: a.email }, "Ditolak")}>tolak</button>
              </div>
            ))}
          </div>
        )}

        {tab === "access" && (
          <>
            <div className="gc-panel">
              <h3>Tambah email (langsung disetujui)</h3>
              <div className="gc-form">
                <input className="gh-in" type="email" placeholder="email@contoh.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                <input className="gh-in" placeholder="catatan (opsional)" maxLength={140} value={note} onChange={(e) => setNote(e.target.value)} />
                <button className="gh-btn" onClick={async () => { if (await act({ action: "add", email, note }, "Email ditambahkan")) { setEmail(""); setNote(""); } }}>tambah</button>
              </div>
            </div>
            <div className="gc-panel">
              <h3>Daftar email ({list.length})</h3>
              <div className="gc-form">
                <input className="gh-in" placeholder="cari email…" value={q} onChange={(e) => setQ(e.target.value)} />
                <select className="gh-in" value={filter} onChange={(e) => setFilter(e.target.value as any)}>
                  <option value="all">semua</option><option value="approved">disetujui</option><option value="pending">menunggu</option><option value="rejected">ditolak</option><option value="revoked">dicabut</option>
                </select>
              </div>
              {list.map((a) => (
                <div className="gc-row" key={a.email}>
                  <div className="gc-main"><b>{a.email}</b><span className="gh-dim">{when(a.decided_at ?? a.requested_at)}{a.note ? ` · ${a.note}` : ""}</span></div>
                  <span className={`gc-tag ${a.status}`}>{a.status}</span>
                  {a.status !== "approved" && <button className="gh-btn" onClick={() => act({ action: "approve", email: a.email }, "Disetujui")}>acc</button>}
                  {a.status === "approved" && <button className="gh-btn danger" onClick={() => act({ action: "revoke", email: a.email }, "Akses dicabut", `Cabut akses ${a.email}?`)}>cabut</button>}
                  <button className="gh-btn" onClick={() => act({ action: "remove", email: a.email }, "Dihapus dari daftar", `Hapus ${a.email} dari daftar? Orang ini bisa meminta akses lagi.`)}>hapus</button>
                </div>
              ))}
              {!list.length && <p className="gh-dim">// kosong.</p>}
            </div>
          </>
        )}

        {tab === "rooms" && (
          <>
            <div className="gc-panel">
              <h3>Buat room</h3>
              <div className="gc-form">
                <input className="gh-in" placeholder="nama (a-z, 0-9, -)" maxLength={32} value={rn} onChange={(e) => setRn(e.target.value)} />
                <input className="gh-in" placeholder="topik (opsional)" maxLength={80} value={rt} onChange={(e) => setRt(e.target.value)} />
                <select className="gh-in" value={rttl} onChange={(e) => setRttl(Number(e.target.value))} aria-label="Pesan hilang setelah">
                  {TTL.map(([v, l]) => <option key={v} value={v}>{l === "permanen" ? "pesan permanen" : `hilang ${l}`}</option>)}
                </select>
                <button className="gh-btn" onClick={async () => { if (await act({ action: "room_create", name: rn, topic: rt, ttl: rttl }, "Room dibuat")) { setRn(""); setRt(""); setRttl(0); } }}>buat</button>
              </div>
            </div>
            <div className="gc-panel">
              <h3>Room ({d.rooms.length})</h3>
              {d.rooms.map((r) => (
                <div className="gc-row wrap" key={r.id}>
                  <div className="gc-main"><b>#{r.name}</b><span className="gh-dim">{r.topic || "—"} · {r.messages} pesan · dibuat {when(r.created_at)}</span></div>
                  <select className="gh-in sm" value={r.ttl ?? 0} onChange={(e) => act({ action: "room_update", id: r.id, ttl: Number(e.target.value) }, "TTL diubah")} aria-label="TTL">
                    {TTL.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <button className="gh-btn" onClick={() => act({ action: "room_update", id: r.id, locked: !r.locked }, r.locked ? "Room dibuka" : "Room dikunci")}>{r.locked ? "buka" : "kunci"}</button>
                  <button className="gh-btn" onClick={() => act({ action: "room_purge", id: r.id }, "Pesan dikosongkan", `Hapus semua pesan di #${r.name}?`)}>kosongkan</button>
                  <button className="gh-btn danger" onClick={() => act({ action: "room_delete", id: r.id }, "Room dihapus", `Hapus room #${r.name} beserta semua pesannya?`)}>hapus</button>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === "audit" && (
          <div className="gc-panel">
            <h3>Audit ({d.logs.length})</h3>
            <p className="gh-dim">Isi pesan tidak pernah tercatat di sini.</p>
            {d.logs.map((l) => (
              <div className="gc-log" key={l.id}>
                <span className="gh-dim">{when(l.at)}</span>
                <span>{l.actor === "system" ? "pengguna" : "owner"} {ACTION[l.action] ?? l.action}{l.target ? ` ${l.target}` : ""}{l.detail ? ` — ${l.detail}` : ""}</span>
              </div>
            ))}
            {!!d.logs.length && <button className="gh-btn danger" onClick={() => act({ action: "clear_logs" }, "Audit dibersihkan", "Hapus seluruh log audit?")}>bersihkan audit</button>}
          </div>
        )}
      </main>
    </div>
  );
}
