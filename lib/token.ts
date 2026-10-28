import { SignJWT, jwtVerify } from "jose";
import { cfg, configIssue } from "./config";

// Sesi login: JWT HS256 di cookie httpOnly. Aman dipakai di middleware (edge) dan server.
export const COOKIE = "kc_session";
export const MAX_AGE = 60 * 60 * 24 * 30;
const key = () => {
  if (configIssue) throw new Error(configIssue);
  return new TextEncoder().encode("session:" + cfg.otpSecret);
};

// via = cara login ("otp" / "google" = baru diverifikasi email; kosong = login password).
// sv = versi sesi user; dinaikkan saat ganti/reset password atau "keluar dari semua perangkat" sehingga token lama langsung mati.
export const signToken = (uid: string, via?: string, sv = 0) =>
  new SignJWT({ ...(via ? { via } : {}), sv }).setProtectedHeader({ alg: "HS256" }).setSubject(uid).setIssuedAt().setExpirationTime(`${MAX_AGE}s`).sign(key());

export type SessionMeta = { uid: string; via?: string; iat?: number; sv: number };

export async function verifyTokenFull(token?: string | null): Promise<SessionMeta | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    return { uid: payload.sub, via: typeof payload.via === "string" ? payload.via : undefined, iat: payload.iat, sv: typeof payload.sv === "number" ? payload.sv : 0 };
  } catch {
    return null;
  }
}

export async function verifyToken(token?: string | null): Promise<string | null> {
  return (await verifyTokenFull(token))?.uid ?? null;
}

// Verifikasi email/Google dianggap "segar" 15 menit (dipakai untuk reset password).
export const isFresh = (m: SessionMeta | null) =>
  !!m?.via && !!m.iat && Date.now() / 1000 - m.iat < 15 * 60;
