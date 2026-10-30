import type { IconName } from "@/components/ui";

export const SECTIONS: { id: string; t: string; d: string; i: IconName }[] = [
  { id: "profil", t: "Profil", d: "Nama, foto, dan bio", i: "user" },
  { id: "akun", t: "Akun", d: "Email, keluar, keamanan", i: "key" },
  { id: "obrolan", t: "Obrolan", d: "Tema, suara, Enter, animasi", i: "chat" },
  { id: "otomatis", t: "Pesan otomatis", d: "Balasan saat tidak di tempat", i: "clock" },
  { id: "perangkat", t: "Perangkat tertaut", d: "Login lain dan kode tautan", i: "link" },
  { id: "developer", t: "Developer", d: "Developer mode dan API key", i: "bolt" },
  { id: "bantuan", t: "Bantuan", d: "Pertanyaan yang sering muncul", i: "info" },
  { id: "tentang", t: "Tentang", d: "Dokumentasi dan versi", i: "sparkle" },
];
