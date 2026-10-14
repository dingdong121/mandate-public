import { TestnetSetup } from "./setup";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
export const dynamic = "force-dynamic";
export default async function Page() {
  await requireChatGPTUser("/testnet-setup");
  return <TestnetSetup />;
}
