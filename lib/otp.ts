import { createHmac } from "crypto";
import { cfg } from "./config";
// Hash terikat ke email supaya kode satu akun tidak bisa dipakai di akun lain.
export const hashOtp = (email: string, code: string) =>
  createHmac("sha256", cfg.otpSecret).update(`${email}:${code}`).digest("hex");
