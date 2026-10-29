import { randomBytes } from "crypto";

// 12 byte acak (CSPRNG) -> 16 karakter base64url. Tidak bisa ditebak.
export const newInviteCode = () => randomBytes(12).toString("base64url");
