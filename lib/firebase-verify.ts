import { createRemoteJWKSet, jwtVerify } from "jose";
import { cfg } from "./config";

// Verifikasi ID token Firebase lewat kunci publik Google (tanpa service account).
const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));

export async function verifyFirebaseToken(idToken: string) {
  const { payload } = await jwtVerify(idToken, JWKS, {
    issuer: `https://securetoken.google.com/${cfg.firebase.projectId}`,
    audience: cfg.firebase.projectId,
  });
  if (!payload.email || payload.email_verified !== true) throw new Error("Email Google belum terverifikasi");
  return {
    email: String(payload.email).toLowerCase(),
    name: typeof payload.name === "string" ? payload.name : undefined,
    picture: typeof payload.picture === "string" ? payload.picture : undefined,
  };
}
