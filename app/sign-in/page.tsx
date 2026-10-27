import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { cfg } from "@/lib/config";
import SignInForm from "./SignInForm";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  if (await getUserId()) redirect("/");
  const { apiKey, authDomain, projectId, appId } = cfg.firebase;
  return <SignInForm firebase={{ apiKey, authDomain, projectId, appId }} />;
}
