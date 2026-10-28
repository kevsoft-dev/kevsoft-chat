import { cookies } from "next/headers";
import { sql } from "./db";
import { COOKIE, MAX_AGE, signToken, verifyToken, verifyTokenFull } from "./token";

export async function readSession() {
  return verifyToken((await cookies()).get(COOKIE)?.value);
}
export async function readSessionMeta() {
  return verifyTokenFull((await cookies()).get(COOKIE)?.value);
}
export async function startSession(uid: string, via?: "otp" | "google") {
  const [u] = await sql`select token_version from users where id = ${uid}`;
  (await cookies()).set(COOKIE, await signToken(uid, via, Number(u?.token_version ?? 0)), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: MAX_AGE,
  });
}
export async function endSession() {
  (await cookies()).set(COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
}
