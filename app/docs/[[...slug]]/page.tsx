import { notFound } from "next/navigation";
import Docs from "@/components/Docs";
import { DOC_PAGES } from "@/lib/docsContent";

export const dynamic = "force-static";
export function generateStaticParams() {
  return [{ slug: [] as string[] }, ...DOC_PAGES.map((p) => ({ slug: [p.id] }))];
}
export async function generateMetadata({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  const p = DOC_PAGES.find((x) => x.id === slug?.[0]);
  return { title: `${p ? p.title + " · " : ""}Dokumentasi kevsoft`, description: p?.desc ?? "Dokumentasi kevsoft-chat: panduan, arsitektur, dan referensi API." };
}

export default async function DocsRoute({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  if (slug && (slug.length > 1 || !DOC_PAGES.some((p) => p.id === slug[0]))) notFound();
  return <Docs slug={slug?.[0] ?? DOC_PAGES[0].id} />;
}
