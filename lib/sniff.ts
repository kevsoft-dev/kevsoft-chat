// Cek isi file (magic bytes) terhadap tipe yang diklaim klien.
const eq = (b: Uint8Array, sig: number[], off = 0) => sig.every((v, i) => b[off + i] === v);

export function sniffMime(b: Uint8Array, mime: string): boolean {
  switch (mime) {
    case "image/jpeg": return eq(b, [0xff, 0xd8, 0xff]);
    case "image/png": return eq(b, [0x89, 0x50, 0x4e, 0x47]);
    case "image/gif": return eq(b, [0x47, 0x49, 0x46, 0x38]);
    case "image/webp": return eq(b, [0x52, 0x49, 0x46, 0x46]) && eq(b, [0x57, 0x45, 0x42, 0x50], 8);
    case "application/pdf": return eq(b, [0x25, 0x50, 0x44, 0x46]);
    case "application/msword":
    case "application/vnd.ms-excel": return eq(b, [0xd0, 0xcf, 0x11, 0xe0]);
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": return eq(b, [0x50, 0x4b, 0x03, 0x04]);
    case "text/plain":
    case "text/csv": return !b.subarray(0, 4096).includes(0); // teks tidak boleh berisi byte NUL
    default: return false;
  }
}
