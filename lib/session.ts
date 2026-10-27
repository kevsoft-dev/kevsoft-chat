import { cookies } from "next/headers";
import { COOKIE, MAX_AGE, signToken, verifyToken, verifyTokenFull } from "./token";

export async function readSession() {
  return verifyToken((await cookies()).get(COOKIE)?.value);
}
export async function readSessionMeta() {
  return verifyTokenFull((await cookies()).get(COOKIE)?.value);
}
export async function startSession(uid: string, via?: "otp" | "google") {
  (await cookies()).set(COOKIE, await signToken(uid, via), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: MAX_AGE,
  });
}
export async function endSession() {
  (await cookies()).set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}
