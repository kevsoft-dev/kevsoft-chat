import { cfg } from "@/lib/config";
import Docs from "@/components/Docs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dokumentasi API · kevsoft", description: "Dokumentasi API publik kevsoft: berita, komentar, dan kritik & saran." };

export default function DocsRoute() {
  return <Docs open={cfg.api.public} />;
}
