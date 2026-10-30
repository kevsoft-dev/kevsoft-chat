import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { cfg } from "@/lib/config";
import SignInForm from "./SignInForm";

export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  const next = (sp.next || "").startsWith("/") && !(sp.next || "").startsWith("//") ? sp.next! : "/chat";
  if (await getUserId()) redirect(next);
  const { apiKey, authDomain, projectId, appId } = cfg.firebase;
  return <SignInForm firebase={{ apiKey, authDomain, projectId, appId }} />;
}
