import { SignJWT, jwtVerify } from "jose";
import { cfg } from "./config";

// Sesi login: JWT HS256 di cookie httpOnly. Aman dipakai di middleware (edge) dan server.
export const COOKIE = "kc_session";
export const MAX_AGE = 60 * 60 * 24 * 30;
const key = () => new TextEncoder().encode("session:" + cfg.otpSecret);

export const signToken = (uid: string) =>
  new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(uid).setIssuedAt().setExpirationTime(`${MAX_AGE}s`).sign(key());

export async function verifyToken(token?: string | null): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}
