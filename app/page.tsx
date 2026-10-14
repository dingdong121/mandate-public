import { AgentBountyApp } from "@/components/agentbounty-app";
import { chatGPTSignInPath, chatGPTSignOutPath, getChatGPTUser } from "@/app/chatgpt-auth";
import {env} from "cloudflare:workers";
import {activePaymentChain} from "@/lib/payment-network";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getChatGPTUser();
  return <AgentBountyApp paymentChainId={activePaymentChain(env)} viewer={{ signedIn: Boolean(user), displayName: user?.displayName ?? null, signInPath: chatGPTSignInPath("/"), signOutPath: chatGPTSignOutPath("/") }} />;
}
