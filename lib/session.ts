import { cookies, headers } from "next/headers";
import { sql } from "./db";
import { clientIp } from "./ratelimit";
import { createDevice, describeUa } from "./devices";
import { COOKIE, MAX_AGE, signToken, verifyToken, verifyTokenFull } from "./token";

export async function readSession() {
  return verifyToken((await cookies()).get(COOKIE)?.value);
}
export async function readSessionMeta() {
  return verifyTokenFull((await cookies()).get(COOKIE)?.value);
}
export type DeviceInfo = { linked?: boolean; label?: string; platform?: string; ip?: string };
// Setiap login membuat satu baris perangkat; id-nya ikut di token sehingga bisa dicabut satu per satu.
export async function startSession(uid: string, via?: "otp" | "google", dev?: DeviceInfo) {
  const [u] = await sql`select token_version from users where id = ${uid}`;
  let did: string | undefined;
  try {
    const h = await headers();
    const d = describeUa(h.get("user-agent") ?? "");
    did = await createDevice(uid, { linked: !!dev?.linked, label: dev?.label || d.label, platform: dev?.platform || d.platform, ip: dev?.ip || clientIp({ headers: h } as unknown as Request) });
  } catch {}
  (await cookies()).set(COOKIE, await signToken(uid, via, Number(u?.token_version ?? 0), did), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: MAX_AGE,
  });
  return did;
}
export async function endSession() {
  (await cookies()).set(COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
}
