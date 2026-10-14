"use client";

import { useEffect, useState } from "react";
import {
  Activity, ArrowUpRight, BadgeCheck, Bot, BriefcaseBusiness, Check, CheckCircle2,
  ChevronRight, CircleDollarSign, Clock3, Copy, Cpu, FileCheck2, Gauge, GitBranch,
  LayoutDashboard, LockKeyhole, Menu, Plus, Radar, ReceiptText, Search, ShieldCheck,
  Sparkles, Star, Users, WalletCards, X, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AgentAccountsList, AgentProfileDetail, AgentProfileDirectory, AgentProfileForm, type AgentProfileDraft } from "@/components/agent-profiles";

type View = "marketplace" | "directory" | "profile" | "overview" | "agents" | "policies" | "bounties" | "transactions";
type InfraStatus = {
  database: string;
  walletMode: "circle" | "awaiting_secrets" | "mock";
  walletProvisioned?: boolean;
  primaryWalletAddress?: string | null;
  primaryBalance?: string | null;
  escrowContract: string;
};
type AgentRecord = {
  id: string;
  name: string;
  purpose: string;
  tagline?: string;
  about?: string;
  primaryCategory?: string;
  skills?: string[];
  tools?: string[];
  workSamples?: Array<{ title: string; url: string; description: string }>;
  availability?: "available" | "busy" | "unavailable";
  minimumBountyMicros?: number;
  typicalDeliveryTime?: string;
  status: "creating" | "active" | "paused" | "archived";
  walletProvider: string;
  walletId?: string | null;
  walletAddress?: string | null;
  chainId: number;
  createdAt: string;
  dailyLimitMicros?: number | null;
  transactionLimitMicros?: number | null;
  spentTodayMicros?: number | null;
  paused?: boolean | null;
};
type AgentDraft = {
  name: string;
  purpose: string;
  dailyLimit: string;
  transactionLimit: string;
};
type BountyDraft = {
  title: string;
  objective: string;
  reward: string;
  toolBudget: string;
  deadline: string;
  criteria: string;
};
type BountyRecord = {
  id: string;
  providerAgentId?: string | null;
  title: string;
  objective: string;
  acceptanceCriteria: string[];
  rewardMicros: number;
  toolBudgetMicros: number;
  deadline: string;
  status: string;
  fundingStage: "draft" | "create_job_pending" | "budget_pending" | "approve_pending" | "fund_pending" | "funded" | "failed";
  currentTransactionId?: string | null;
  fundingError?: string | null;
  onchainJobId?: string | null;
  contractAddress?: string | null;
  createJobTxHash?: string | null;
  setBudgetTxHash?: string | null;
  approveTxHash?: string | null;
  fundTxHash?: string | null;
  deliverable?: string | null;
  deliverableHash?: string | null;
  settlementStage: "idle" | "submit_pending" | "complete_pending" | "reject_pending" | "refund_pending" | "settled";
  settlementTransactionId?: string | null;
  settlementError?: string | null;
  submitTxHash?: string | null;
  completeTxHash?: string | null;
  rejectTxHash?: string | null;
  refundTxHash?: string | null;
  refundable?: boolean;
  explorerUrl?: string | null;
  createdAt: string;
};
type SettlementAction = "submit" | "approve" | "reject" | "refund";
type ActivityRecord = {
  id: string;
  kind: string;
  title: string;
  note: string;
  amountMicros: number;
  direction: "in" | "out" | "none";
  status: "settled" | "pending" | "blocked" | "authorized" | "review" | "rejected";
  txHash?: string | null;
  createdAt: string;
};
type PaymentIntentRecord = {
  id: string;
  agentId?: string | null;
  agentName?: string | null;
  amountMicros: number;
  recipientAddress?: string | null;
  purpose: string;
  policyDecision: { outcome?: string; reasons?: string[]; serviceName?: string; manuallyApproved?: boolean };
  status: "authorized" | "review_required" | "blocked" | "rejected";
  idempotencyKey: string;
  createdAt: string;
};
type ActivityMetrics = { completedMicros: number; activeBounties: number; completedBounties: number; policyBlocks: number };
type EscrowDeployment = {
  status: "not_deployed" | "pending" | "complete" | "failed";
  contractAddress?: string | null;
  txHash?: string | null;
  failureReason?: string | null;
  explorerUrl?: string | null;
};
const txs = [
  ["Arc Data Search", "Bounty #104 · source discovery", "−0.03", "Settled", Search],
  ["Policy engine", "Blocked · transaction limit exceeded", "0.00", "Blocked", ShieldCheck],
  ["Bounty payout", "Bounty #101 · market landscape", "+1.00", "Settled", CircleDollarSign],
  ["Synthesis API", "Bounty #101 · final analysis", "−0.05", "Settled", Sparkles],
] as const;
function Brand() {
  return <div className="flex items-center gap-3"><div className="grid size-9 place-items-center rounded-xl border border-cyan-300/30 bg-cyan-300/10"><span className="relative block size-4 rotate-45 rounded-[3px] border-2 border-cyan-300 before:absolute before:inset-[3px] before:bg-lime-300" /></div><div><div className="text-[15px] font-semibold text-white">Mandate</div><div className="text-[10px] uppercase tracking-[.17em] text-slate-500">AgentBounty</div></div></div>;
}
function Dot() { return <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />; }
function Metric({ label, value, note, icon: Icon, glow }: { label: string; value: string; note: string; icon: typeof Bot; glow: string }) {
  return <div className="relative overflow-hidden rounded-2xl border border-white/[.07] bg-[#101826] p-5"><div className={`absolute -right-8 -top-8 size-24 rounded-full blur-3xl ${glow}`} /><div className="relative flex justify-between text-sm text-slate-400"><span>{label}</span><Icon className="size-4" /></div><div className="relative mt-4 text-[26px] font-semibold tracking-[-.04em] text-white">{value}</div><div className="relative mt-1 text-xs text-slate-500">{note}</div></div>;
}

function AgentDialog({ open, setOpen, done, suggestedName, creating }: { open: boolean; setOpen: (v: boolean) => void; done: (draft: AgentDraft) => void; suggestedName: string; creating: boolean }) {
  const [draft, setDraft] = useState<AgentDraft>({ name: suggestedName, purpose: "Research Arc projects and purchase approved data services.", dailyLimit: "1.00", transactionLimit: "0.10" });
  return <Dialog open={open} onOpenChange={creating ? undefined : setOpen}><DialogContent className="border-white/10 bg-[#0d1522] text-white sm:max-w-[560px]"><DialogHeader><DialogTitle>Create an agent account</DialogTitle><DialogDescription className="text-slate-400">Give the agent a wallet and enforceable limits. The model never receives the signing key.</DialogDescription></DialogHeader><div className="grid gap-4"><label className="grid gap-2 text-sm text-slate-300">Agent name<Input value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} className="border-white/10 bg-white/[.04]" /></label><label className="grid gap-2 text-sm text-slate-300">Purpose<Textarea value={draft.purpose} onChange={event => setDraft({ ...draft, purpose: event.target.value })} className="border-white/10 bg-white/[.04]" /></label><div className="grid grid-cols-2 gap-3"><label className="grid gap-2 text-sm text-slate-300">Daily limit (USDC)<Input type="number" min="0.01" step="0.01" value={draft.dailyLimit} onChange={event => setDraft({ ...draft, dailyLimit: event.target.value })} className="border-white/10 bg-white/[.04]" /></label><label className="grid gap-2 text-sm text-slate-300">Transaction cap (USDC)<Input type="number" min="0.01" step="0.01" value={draft.transactionLimit} onChange={event => setDraft({ ...draft, transactionLimit: event.target.value })} className="border-white/10 bg-white/[.04]" /></label></div><div className="flex items-center justify-between rounded-xl border border-white/[.08] bg-white/[.025] p-4"><div><div className="text-sm">Emergency pause</div><div className="mt-1 text-xs text-slate-500">Owner can stop outgoing payments.</div></div><Switch defaultChecked /></div></div><DialogFooter><Button variant="ghost" disabled={creating} onClick={() => setOpen(false)}>Cancel</Button><Button disabled={creating || !draft.name.trim()} className="bg-cyan-300 text-[#071018] hover:bg-cyan-200" onClick={() => done(draft)}><Zap />{creating ? "Creating wallet…" : "Create agent"}</Button></DialogFooter></DialogContent></Dialog>;
}
function BountyDialog({ open, setOpen, done, funding }: { open: boolean; setOpen: (v: boolean) => void; done: (draft: BountyDraft) => void; funding: boolean }) {
  const [draft, setDraft] = useState<BountyDraft>({ title: "Map the highest-potential agent infrastructure on Arc", objective: "Research the Arc ecosystem and produce a cited market map with opportunities, risks, and a ranked shortlist.", reward: "1.00", toolBudget: "0.20", deadline: "", criteria: "Five qualified projects\nTwo sources per project\nOpportunity and risk scoring\nFinal report with source links" });
  return <Dialog open={open} onOpenChange={funding ? undefined : setOpen}><DialogContent className="border-white/10 bg-[#0d1522] text-white sm:max-w-[660px]"><DialogHeader><DialogTitle>Post an open bounty</DialogTitle><DialogDescription className="text-slate-400">Define the outcome first. Agents apply next; you select one before any USDC is locked.</DialogDescription></DialogHeader><div className="grid gap-4"><label className="grid gap-2 text-sm text-slate-300">Task objective<Input value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} className="border-white/10 bg-white/[.04]" /></label><label className="grid gap-2 text-sm text-slate-300">Scope and output format<Textarea value={draft.objective} onChange={event => setDraft({ ...draft, objective: event.target.value })} className="min-h-24 border-white/10 bg-white/[.04]" /></label><div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><label className="grid gap-2 text-sm text-slate-300">Reward (USDC)<Input type="number" min="0.01" step="0.01" value={draft.reward} onChange={event => setDraft({ ...draft, reward: event.target.value })} className="border-white/10 bg-white/[.04]" /></label><label className="grid gap-2 text-sm text-slate-300">Tool budget<Input type="number" min="0" step="0.01" value={draft.toolBudget} onChange={event => setDraft({ ...draft, toolBudget: event.target.value })} className="border-white/10 bg-white/[.04]" /></label><label className="grid gap-2 text-sm text-slate-300">Final deadline<Input type="datetime-local" value={draft.deadline} onChange={event => setDraft({ ...draft, deadline: event.target.value })} className="border-white/10 bg-white/[.04]" /></label></div><label className="grid gap-2 text-sm text-slate-300">Acceptance criteria <span className="text-xs text-slate-600">One verifiable check per line</span><Textarea value={draft.criteria} onChange={event => setDraft({ ...draft, criteria: event.target.value })} className="min-h-28 border-white/10 bg-white/[.04]" /></label><div className="rounded-xl border border-cyan-300/15 bg-cyan-300/[.04] p-3 text-xs leading-5 text-slate-400"><span className="text-cyan-200">Open for applications.</span> Posting does not move funds. Arc escrow becomes available only after you select a connected Agent Account.</div></div><DialogFooter><Button variant="ghost" disabled={funding} onClick={() => setOpen(false)}>Cancel</Button><Button disabled={funding || !draft.title.trim() || !draft.objective.trim() || !draft.deadline} className="bg-lime-300 text-[#071018] hover:bg-lime-200" onClick={() => done(draft)}><BriefcaseBusiness />{funding ? "Publishing…" : "Publish open bounty"}</Button></DialogFooter></DialogContent></Dialog>;
}

function SelectAgentDialog({ bounty, agents, open, setOpen, selecting, done }: { bounty?: BountyRecord; agents: AgentRecord[]; open: boolean; setOpen: (value: boolean) => void; selecting: boolean; done: (agentId: string) => void }) {
  const [agentId, setAgentId] = useState("");
  const available = agents.filter(agent => agent.status === "active" && agent.walletProvider === "circle" && agent.walletAddress);
  return <Dialog open={open} onOpenChange={selecting ? undefined : setOpen}><DialogContent className="border-white/10 bg-[#0d1522] text-white sm:max-w-[580px]"><DialogHeader><DialogTitle>Select the delivery Agent</DialogTitle><DialogDescription className="text-slate-400">This locks {bounty?.title ?? "the bounty"} to one connected Agent Account. Funding happens in the next step.</DialogDescription></DialogHeader><div className="space-y-3">{available.map(agent => <button key={agent.id} onClick={() => setAgentId(agent.id)} className={`w-full rounded-xl border p-4 text-left transition ${agentId === agent.id ? "border-cyan-300/40 bg-cyan-300/[.06]" : "border-white/[.07] bg-white/[.02] hover:border-white/15"}`}><div className="flex items-center justify-between gap-3"><div><div className="text-sm text-white">{agent.name}</div><div className="mt-1 text-xs text-slate-500">{agent.purpose || "Connected Agent Account"}</div></div>{agentId === agent.id && <CheckCircle2 className="size-5 text-cyan-300" />}</div><div className="mt-3 font-mono text-xs text-slate-600">{agent.walletAddress?.slice(0, 12)}…{agent.walletAddress?.slice(-8)}</div></button>)}{!available.length && <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-500">Create an active Agent Account before selecting a provider.</div>}</div><DialogFooter><Button variant="ghost" disabled={selecting} onClick={() => setOpen(false)}>Cancel</Button><Button disabled={selecting || !agentId} className="bg-cyan-300 text-[#071018] hover:bg-cyan-200" onClick={() => done(agentId)}><LockKeyhole />{selecting ? "Locking selection…" : "Select & lock"}</Button></DialogFooter></DialogContent></Dialog>;
}

function SettlementDialog({ bounty, action, open, setOpen, submitting, done }: { bounty?: BountyRecord; action: SettlementAction; open: boolean; setOpen: (value: boolean) => void; submitting: boolean; done: (input: { deliverable?: string; note?: string }) => void }) {
  const [value, setValue] = useState("");
  const copy = action === "submit"
    ? { title: "Submit agent result", description: "The selected Agent wallet signs this deliverable hash on Arc.", label: "Result URL or delivery summary", button: "Submit on Arc" }
    : action === "approve"
      ? { title: "Approve payout", description: `Release ${bounty ? formatUsdc(bounty.rewardMicros) : "0.00"} USDC from escrow to the Agent wallet.`, label: "Approval note (optional)", button: "Approve & pay" }
      : action === "reject"
        ? { title: "Reject and refund", description: "Record the rejection on Arc, then return the locked USDC to treasury.", label: "Rejection reason", button: "Reject & refund" }
        : { title: "Refund expired bounty", description: "Return the locked reward from escrow to treasury.", label: "Refund note (optional)", button: "Refund treasury" };
  return <Dialog open={open} onOpenChange={submitting ? undefined : setOpen}><DialogContent className="border-white/10 bg-[#0d1522] text-white sm:max-w-[560px]"><DialogHeader><DialogTitle>{copy.title}</DialogTitle><DialogDescription className="text-slate-400">{copy.description}</DialogDescription></DialogHeader>{action !== "refund" && <label className="grid gap-2 text-sm text-slate-300">{copy.label}<Textarea value={value} onChange={event => setValue(event.target.value)} className="min-h-28 border-white/10 bg-white/[.04]" placeholder={action === "submit" ? "https://… or a concise result summary" : "Optional audit note"} /></label>}<div className="rounded-xl border border-cyan-300/10 bg-cyan-300/[.035] p-3 text-xs leading-5 text-slate-400">This action is signed by the correct Circle wallet and recorded on Arc Testnet.</div><DialogFooter><Button variant="ghost" disabled={submitting} onClick={() => setOpen(false)}>Cancel</Button><Button disabled={submitting || (action === "submit" && value.trim().length < 3)} className={action === "reject" || action === "refund" ? "bg-rose-300 text-[#071018] hover:bg-rose-200" : "bg-lime-300 text-[#071018] hover:bg-lime-200"} onClick={() => done(action === "submit" ? { deliverable: value } : { note: value })}>{submitting ? "Submitting…" : copy.button}</Button></DialogFooter></DialogContent></Dialog>;
}

export function MandateApp() {
  const [view, setView] = useState<View>("marketplace");
  const [menu, setMenu] = useState(false);
  const [agentDialog, setAgentDialog] = useState(false);
  const [profileId, setProfileId] = useState<string>();
  const [connectingWallet, setConnectingWallet] = useState(false);
  const [walletOfferOpen, setWalletOfferOpen] = useState(false);
  const [savingControls, setSavingControls] = useState(false);
  const [bountyDialog, setBountyDialog] = useState(false);
  const [paused, setPaused] = useState(false);
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [agentsError, setAgentsError] = useState("");
  const [creatingAgent, setCreatingAgent] = useState(false);
  const [escrow, setEscrow] = useState<EscrowDeployment>({ status: "not_deployed" });
  const [deployingEscrow, setDeployingEscrow] = useState(false);
  const [addedJob, setAddedJob] = useState(false);
  const [bounties, setBounties] = useState<BountyRecord[]>([]);
  const [bountiesLoading, setBountiesLoading] = useState(true);
  const [fundingBounty, setFundingBounty] = useState(false);
  const [selectionBounty, setSelectionBounty] = useState<BountyRecord>();
  const [selectionDialog, setSelectionDialog] = useState(false);
  const [selectingAgent, setSelectingAgent] = useState(false);
  const [settlementBounty, setSettlementBounty] = useState<BountyRecord>();
  const [settlementAction, setSettlementAction] = useState<SettlementAction>("submit");
  const [settlementDialog, setSettlementDialog] = useState(false);
  const [submittingSettlement, setSubmittingSettlement] = useState(false);
  const [gasFundingAgentId, setGasFundingAgentId] = useState<string>();
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [intents, setIntents] = useState<PaymentIntentRecord[]>([]);
  const [intentsLoading, setIntentsLoading] = useState(true);
  const [intentSubmitting, setIntentSubmitting] = useState(false);
  const [reviewingIntentId, setReviewingIntentId] = useState<string>();
  const [activityMetrics, setActivityMetrics] = useState<ActivityMetrics>({ completedMicros: 0, activeBounties: 0, completedBounties: 0, policyBlocks: 0 });
  const [notice, setNotice] = useState("");
  const [infra, setInfra] = useState<InfraStatus>({ database: "checking", walletMode: "mock", escrowContract: "not_deployed" });
  const nav = [["marketplace", "Marketplace", Radar], ["directory", "Agent directory", Users], ["bounties", "My bounties", BriefcaseBusiness], ["overview", "Mandate treasury", LayoutDashboard], ["agents", "Agent accounts", Bot], ["policies", "Payment intents", ShieldCheck], ["transactions", "Audit trail", ReceiptText]] as const;
  const show = (s: string) => setNotice(s);
  async function loadAgents() {
    try {
      const response = await fetch("/api/agents");
      const result = await response.json() as { error?: string; agents?: AgentRecord[] };
      if (!response.ok) throw new Error(result.error ?? "Agents could not be loaded");
      setAgents(result.agents ?? []);
      setAgentsError("");
    } catch {
      setAgentsError("Agent wallets could not be loaded.");
    } finally {
      setAgentsLoading(false);
    }
  }
  async function loadEscrow() {
    try {
      const response = await fetch("/api/contracts/escrow", { cache: "no-store" });
      const result = await response.json() as EscrowDeployment & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Escrow status could not be loaded");
      setEscrow(result);
      if (result.contractAddress) setInfra(current => ({ ...current, escrowContract: result.contractAddress! }));
    } catch {
      // Keep the last known deployment state during temporary API failures.
    }
  }
  async function loadBounties() {
    try {
      const response = await fetch("/api/bounties", { cache: "no-store" });
      const result = await response.json() as { error?: string; bounties?: BountyRecord[] };
      if (!response.ok) throw new Error(result.error ?? "Bounties could not be loaded");
      setBounties(result.bounties ?? []);
      setAddedJob((result.bounties ?? []).length > 0);
    } catch {
      show("Bounties could not be loaded");
    } finally {
      setBountiesLoading(false);
    }
  }
  async function loadActivity() {
    try {
      const response = await fetch("/api/activity", { cache: "no-store" });
      const result = await response.json() as { error?: string; activities?: ActivityRecord[]; metrics?: ActivityMetrics };
      if (!response.ok) throw new Error(result.error ?? "Activity could not be loaded");
      setActivities(result.activities ?? []);
      setActivityMetrics(result.metrics ?? { completedMicros: 0, activeBounties: 0, completedBounties: 0, policyBlocks: 0 });
    } catch {
      // Preserve the last audit snapshot during a temporary failure.
    }
  }
  async function loadIntents() {
    try {
      const response = await fetch("/api/intents", { cache: "no-store" });
      const result = await response.json() as { error?: string; intents?: PaymentIntentRecord[] };
      if (!response.ok) throw new Error(result.error ?? "Payment intents could not be loaded");
      setIntents(result.intents ?? []);
    } catch {
      show("Payment intents could not be loaded");
    } finally { setIntentsLoading(false); }
  }
  async function submitIntent(input: { agentId: string; recipient: string; serviceName: string; amount: string; purpose: string }) {
    const amountMicros = Math.round(Number(input.amount) * 1_000_000);
    if (!input.agentId || !/^0x[a-fA-F0-9]{40}$/.test(input.recipient) || !Number.isSafeInteger(amountMicros) || amountMicros < 1 || input.purpose.trim().length < 8) {
      show("Choose an Agent and enter a valid amount, address, and purpose"); return;
    }
    setIntentSubmitting(true);
    try {
      const response = await fetch("/api/intents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...input, amountMicros, idempotencyKey: crypto.randomUUID() }) });
      const result = await response.json() as { error?: string; decision?: { outcome?: string } };
      if (!response.ok) throw new Error(result.error ?? "Payment intent could not be evaluated");
      await Promise.all([loadIntents(), loadActivity(), loadAgents()]);
      const outcome = result.decision?.outcome;
      show(outcome === "allowed" ? "Policy passed · payment authorized" : outcome === "review_required" ? "New recipient · owner approval required" : "Payment blocked by policy");
    } catch (error) { show(error instanceof Error ? error.message : "Payment intent failed"); }
    finally { setIntentSubmitting(false); }
  }
  async function reviewIntent(intent: PaymentIntentRecord, action: "approve" | "reject", trustRecipient = false) {
    setReviewingIntentId(intent.id);
    try {
      const response = await fetch(`/api/intents/${intent.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, trustRecipient, serviceName: intent.policyDecision?.serviceName }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Review could not be completed");
      await Promise.all([loadIntents(), loadActivity(), loadAgents()]);
      show(action === "approve" ? trustRecipient ? "Authorized · recipient trusted for future requests" : "Payment authorized once" : "Payment request rejected");
    } catch (error) { show(error instanceof Error ? error.message : "Review failed"); }
    finally { setReviewingIntentId(undefined); }
  }
  async function updateAgentPolicy(agent: AgentRecord, paused: boolean) {
    setAgents(current => current.map(row => row.id === agent.id ? { ...row, paused } : row));
    try {
      const response = await fetch(`/api/agents/${agent.id}/policy`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ paused }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Policy could not be updated");
      show(paused ? `${agent.name} payments paused` : `${agent.name} payments resumed`);
    } catch (error) {
      setAgents(current => current.map(row => row.id === agent.id ? { ...row, paused: !paused } : row));
      show(error instanceof Error ? error.message : "Policy update failed");
    }
  }
  async function refreshFunding(id: string) {
    try {
      const response = await fetch(`/api/bounties/${id}/fund`, { cache: "no-store" });
      const result = await response.json() as { error?: string; bounty: BountyRecord };
      if (!response.ok) throw new Error(result.error ?? "Funding status could not be refreshed");
      setBounties(current => current.map(bounty => bounty.id === id ? result.bounty : bounty));
      if (result.bounty.fundingStage === "funded") { show(`Bounty #${result.bounty.onchainJobId} funded on Arc`); void loadActivity(); }
    } catch (error) {
      show(error instanceof Error ? error.message : "Funding status check failed");
    }
  }
  async function startFunding(id: string) {
    try {
      const response = await fetch(`/api/bounties/${id}/fund`, { method: "POST" });
      const result = await response.json() as { error?: string; bounty: BountyRecord };
      if (!response.ok) throw new Error(result.error ?? "Funding could not be started");
      setBounties(current => current.map(bounty => bounty.id === id ? result.bounty : bounty));
      show(result.bounty.fundingError ? "Funding retry submitted" : "Arc funding started");
    } catch (error) { show(error instanceof Error ? error.message : "Funding could not be started"); }
  }
  async function refreshSettlement(id: string) {
    try {
      const response = await fetch(`/api/bounties/${id}/settle`, { cache: "no-store" });
      const result = await response.json() as { error?: string; bounty: BountyRecord };
      if (!response.ok) throw new Error(result.error ?? "Settlement status could not be refreshed");
      setBounties(current => current.map(bounty => bounty.id === id ? result.bounty : bounty));
      if (["completed", "expired"].includes(result.bounty.status)) { show(result.bounty.status === "completed" ? "Payout completed on Arc" : "Escrow refunded to treasury"); void loadActivity(); }
    } catch (error) { show(error instanceof Error ? error.message : "Settlement status check failed"); }
  }
  function openSettlement(bounty: BountyRecord, action: SettlementAction) {
    setSettlementBounty(bounty);
    setSettlementAction(action);
    setSettlementDialog(true);
  }
  async function settle(input: { deliverable?: string; note?: string }) {
    if (!settlementBounty) return;
    setSubmittingSettlement(true);
    try {
      const response = await fetch(`/api/bounties/${settlementBounty.id}/settle`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: settlementAction, ...input }) });
      const result = await response.json() as { error?: string; bounty: BountyRecord };
      if (!response.ok) throw new Error(result.error ?? "Settlement could not be started");
      setBounties(current => current.map(bounty => bounty.id === settlementBounty.id ? result.bounty : bounty));
      setSettlementDialog(false);
      show(settlementAction === "submit" ? "Agent submission started" : settlementAction === "approve" ? "Payout approval started" : "Refund flow started");
    } catch (error) { show(error instanceof Error ? error.message : "Settlement could not be started"); void loadBounties(); }
    finally { setSubmittingSettlement(false); }
  }
  async function topUpTestGas(bounty: BountyRecord) {
    if (!bounty.providerAgentId) return;
    setGasFundingAgentId(bounty.providerAgentId);
    try {
      const response = await fetch(`/api/agents/${bounty.providerAgentId}/gas`, { method: "POST" });
      const result = await response.json() as { error?: string; transactionId: string };
      if (!response.ok) throw new Error(result.error ?? "Test gas transfer could not be started");
      show("Sending 0.05 test USDC for Agent gas…");
      for (let attempt = 0; attempt < 16; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 2500));
        const statusResponse = await fetch(`/api/agents/${bounty.providerAgentId}/gas?transactionId=${encodeURIComponent(result.transactionId)}`, { cache: "no-store" });
        const status = await statusResponse.json() as { error?: string; state: string };
        if (!statusResponse.ok) throw new Error(status.error ?? "Gas transfer status failed");
        if (status.state === "COMPLETE") { show("Agent test gas is ready · retry submission"); return; }
        if (["FAILED", "DENIED", "CANCELLED", "STUCK"].includes(status.state)) throw new Error(status.error ?? `Gas transfer ${status.state.toLowerCase()}`);
      }
      show("Gas transfer is still processing · check again shortly");
    } catch (error) { show(error instanceof Error ? error.message : "Test gas transfer failed"); }
    finally { setGasFundingAgentId(undefined); }
  }
  async function deployEscrow() {
    setDeployingEscrow(true);
    try {
      const response = await fetch("/api/contracts/escrow", { method: "POST" });
      const result = await response.json() as EscrowDeployment & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Escrow deployment could not be started");
      setEscrow(result);
      show(result.status === "complete" ? "Bounty escrow is live" : "Escrow deployment submitted to Arc");
    } catch (error) {
      show(error instanceof Error ? error.message : "Escrow deployment failed");
    } finally {
      setDeployingEscrow(false);
    }
  }
  async function saveAgent(draft: AgentProfileDraft) {
    setCreatingAgent(true);
    try {
      const response = await fetch("/api/agents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(draft) });
      const result = await response.json() as { error?: string; agent: AgentRecord };
      if (!response.ok) throw new Error(result.error ?? "Agent could not be saved");
      setAgents(current => [result.agent, ...current.filter(agent => agent.id !== result.agent.id)]);
      setAgentDialog(false);
      setProfileId(result.agent.id);
      setView("profile");
      setWalletOfferOpen(true);
      show("Agent profile created · connect a Circle account when ready");
    } catch (error) { show(error instanceof Error ? error.message : "Agent profile could not be created"); }
    finally { setCreatingAgent(false); }
  }
  async function connectWallet(id: string) {
    setConnectingWallet(true);
    try {
      const response = await fetch(`/api/agents/${id}/wallet`, { method: "POST" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Circle account could not be connected");
      await loadAgents();
      setWalletOfferOpen(false);
      show("Circle wallet ready · Arc payments enabled");
    } catch (error) { show(error instanceof Error ? error.message : "Circle account could not be connected"); }
    finally { setConnectingWallet(false); }
  }
  async function saveControls(id: string, input: { dailyLimitMicros: number; transactionLimitMicros: number; paused: boolean }) {
    setSavingControls(true);
    try {
      const response = await fetch(`/api/agents/${id}/policy`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Wallet controls could not be saved");
      await loadAgents(); show("Wallet controls saved");
    } catch (error) { show(error instanceof Error ? error.message : "Wallet controls could not be saved"); }
    finally { setSavingControls(false); }
  }
  async function selectFromProfile(agentId: string, bountyId: string) {
    try {
      const response = await fetch(`/api/bounties/${bountyId}/select`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ agentId }) });
      const result = await response.json() as { error?: string; bounty: BountyRecord };
      if (!response.ok) throw new Error(result.error ?? "Agent could not be selected");
      setBounties(current => current.map(bounty => bounty.id === bountyId ? result.bounty : bounty));
      setView("bounties"); show("Agent selected · Arc escrow can now be funded");
    } catch (error) { show(error instanceof Error ? error.message : "Agent selection failed"); }
  }
  async function saveBounty(draft: BountyDraft) {
    const rewardMicros = Math.round(Number(draft.reward) * 1_000_000);
    const toolBudgetMicros = Math.round(Number(draft.toolBudget) * 1_000_000);
    const deadlineMillis = new Date(draft.deadline).getTime();
    const criteria = draft.criteria.split("\n").map(value => value.trim()).filter(Boolean);
    if (!Number.isFinite(rewardMicros) || rewardMicros < 1 || !Number.isFinite(toolBudgetMicros) || toolBudgetMicros < 0 || !criteria.length || !Number.isFinite(deadlineMillis) || deadlineMillis <= Date.now()) {
      show("Check the reward, deadline, and acceptance criteria");
      return;
    }
    const deadline = new Date(deadlineMillis).toISOString();
    setFundingBounty(true);
    try {
      const response = await fetch("/api/bounties", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: draft.title, objective: draft.objective, criteria, rewardMicros, toolBudgetMicros, deadline }) });
      const result = await response.json() as { error?: string; bounty: BountyRecord };
      if (!response.ok) throw new Error(result.error ?? "Bounty could not be saved");
      setBounties(current => [result.bounty, ...current]);
      setBountyDialog(false); setAddedJob(true); setView("marketplace");
      show("Bounty published · open for applications");
    } catch (error) { show(error instanceof Error ? error.message : "Bounty could not be published"); }
    finally { setFundingBounty(false); }
  }
  async function selectAgent(agentId: string) {
    if (!selectionBounty) return;
    setSelectingAgent(true);
    try {
      const response = await fetch(`/api/bounties/${selectionBounty.id}/select`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ agentId }) });
      const result = await response.json() as { error?: string; bounty: BountyRecord };
      if (!response.ok) throw new Error(result.error ?? "Agent could not be selected");
      setBounties(current => current.map(bounty => bounty.id === selectionBounty.id ? result.bounty : bounty));
      setSelectionDialog(false);
      show("Agent selected · escrow funding is now available");
    } catch (error) { show(error instanceof Error ? error.message : "Agent selection failed"); }
    finally { setSelectingAgent(false); }
  }
  useEffect(() => { if (!notice) return; const id = setTimeout(() => setNotice(""), 2600); return () => clearTimeout(id); }, [notice]);
  useEffect(() => { void fetch("/api/system/status").then(r => r.json() as Promise<InfraStatus>).then(setInfra).catch(() => undefined); }, []);
  useEffect(() => { const id = setTimeout(() => { void loadAgents(); }, 0); return () => clearTimeout(id); }, []);
  useEffect(() => { const id = setTimeout(() => { void loadEscrow(); }, 0); return () => clearTimeout(id); }, []);
  useEffect(() => { const id = setTimeout(() => { void loadBounties(); }, 0); return () => clearTimeout(id); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const id = setTimeout(() => { void loadActivity(); }, 0); return () => clearTimeout(id); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const id = setTimeout(() => { void loadIntents(); }, 0); return () => clearTimeout(id); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (escrow.status !== "pending") return;
    const id = setInterval(() => { void loadEscrow(); }, 4000);
    return () => clearInterval(id);
  }, [escrow.status]);
  useEffect(() => {
    const pending = bounties.filter(bounty => !["draft", "funded", "failed"].includes(bounty.fundingStage));
    if (!pending.length) return;
    const id = setInterval(() => { pending.forEach(bounty => { void refreshFunding(bounty.id); }); }, 4500);
    return () => clearInterval(id);
  }, [bounties]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const pending = bounties.filter(bounty => bounty.settlementStage?.endsWith("_pending"));
    if (!pending.length) return;
    const id = setInterval(() => { pending.forEach(bounty => { void refreshSettlement(bounty.id); }); }, 4500);
    return () => clearInterval(id);
  }, [bounties]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const c = (document as Document & { modelContext?: { registerTool?: (x: unknown, o?: { signal?: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!c?.registerTool) return; const a = new AbortController();
    void Promise.resolve(c.registerTool({ name: "stage_agent_account", title: "Stage agent account", description: "Open the agent creation flow for review.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: async () => { setAgentDialog(true); return { status: "staged", reviewRequired: true }; } }, { signal: a.signal })).catch(() => undefined);
    return () => a.abort();
  }, []);
  return <div className="min-h-screen bg-[#071018] text-slate-100"><div className="pointer-events-none fixed inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.018)_1px,transparent_1px)] [background-size:32px_32px]" />
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-white/[.07] bg-[#09121d]/95 px-4 py-5 backdrop-blur-xl transition-transform lg:translate-x-0 ${menu ? "translate-x-0" : "-translate-x-full"}`}><div className="flex items-center justify-between px-2"><Brand /><button className="lg:hidden" onClick={() => setMenu(false)} aria-label="Close menu"><X /></button></div><nav className="mt-9 space-y-1">{nav.map(([id, label, Icon]) => <button key={id} onClick={() => { setView(id); setMenu(false); }} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${view === id ? "bg-white/[.07] text-white" : "text-slate-500 hover:bg-white/[.035]"}`}><Icon className={`size-[18px] ${view === id ? "text-cyan-300" : ""}`} />{label}{(id === "agents" || id === "bounties") && <span className="ml-auto text-xs">{id === "agents" ? agents.length : bounties.length}</span>}</button>)}</nav><div className="mt-8 px-3 text-[10px] uppercase tracking-[.18em] text-slate-600">Infrastructure</div><div className="mt-3 space-y-2 rounded-xl border border-white/[.06] bg-white/[.02] p-3 text-xs"><div className="flex justify-between text-slate-400"><span className="flex items-center gap-2"><Dot />Arc Testnet</span><span>5042002</span></div><div className="flex justify-between text-slate-500"><span>Policy engine</span><span className="text-emerald-400">Enforcing</span></div><div className="flex justify-between text-slate-500"><span>Database</span><span className={infra.database === "connected" ? "text-emerald-400" : "text-amber-300"}>{infra.database}</span></div><div className="flex justify-between text-slate-500"><span>Wallet adapter</span><span className={infra.walletMode === "circle" ? "text-emerald-400" : "text-amber-300"}>{infra.walletMode}</span></div><div className="flex justify-between text-slate-500"><span>Escrow</span><span className="text-amber-300">{infra.escrowContract === "not_deployed" ? "Not deployed" : "Live"}</span></div></div><div className="mt-auto rounded-2xl border border-cyan-300/10 bg-cyan-300/[.035] p-4"><div className="flex gap-2 text-sm"><ShieldCheck className="size-4 text-cyan-300" />Keys stay outside AI</div><p className="mt-2 text-xs leading-5 text-slate-500">Models propose intents. Mandate enforces policy before signing.</p></div></aside>
    <main className="relative lg:pl-[248px]"><header className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-white/[.06] bg-[#071018]/80 px-5 backdrop-blur-xl lg:px-8"><div className="flex items-center gap-3"><button className="lg:hidden" onClick={() => setMenu(true)} aria-label="Open menu"><Menu /></button><div><div className="text-sm font-medium capitalize">{view === "policies" ? "Payment intents" : view === "directory" ? "Agent directory" : view}</div><div className="hidden text-xs text-slate-600 sm:block">AI labor, verified outcomes, USDC settlement</div></div></div><Button variant="outline" className="border-white/10 bg-white/[.025] text-slate-200 hover:bg-white/[.06]" onClick={() => { if (infra.primaryWalletAddress) void navigator.clipboard.writeText(infra.primaryWalletAddress); show("Wallet copied"); }}><WalletCards />{infra.primaryWalletAddress ? `${infra.primaryWalletAddress.slice(0, 6)}…${infra.primaryWalletAddress.slice(-4)}` : "Wallet pending"}</Button></header><div className="mx-auto max-w-[1450px] px-5 py-7 lg:px-8 lg:py-9">{view === "marketplace" && <Marketplace bounties={bounties} agents={agents} loading={bountiesLoading} openJob={() => setBountyDialog(true)} setView={setView} />}{view === "directory" && <AgentProfileDirectory agents={agents} onCreate={() => setAgentDialog(true)} onView={id => { setProfileId(id); setView("profile"); }} />}{view === "profile" && <AgentProfileDetail key={profileId} profileId={profileId} agent={agents.find(agent => agent.id === profileId)} bounties={bounties} onBack={() => setView("directory")} onConnectWallet={id => { void connectWallet(id); }} onUpdatePolicy={(id, input) => { void saveControls(id, input); }} onSelectBounty={(id, bountyId) => { void selectFromProfile(id, bountyId); }} busy={connectingWallet || savingControls} />}{view === "overview" && <OverviewLive bounties={bounties} agents={agents} activities={activities} metrics={activityMetrics} setView={setView} openAgent={() => setAgentDialog(true)} openJob={() => setBountyDialog(true)} walletBalance={infra.primaryBalance ?? "—"} walletAddress={infra.primaryWalletAddress ?? undefined} escrow={escrow} />}{view === "agents" && <AgentAccountsList agents={agents} onCreate={() => setAgentDialog(true)} onView={id => { setProfileId(id); setView("profile"); }} />}{view === "policies" && <PaymentIntents agents={agents} intents={intents} loading={intentsLoading} submitting={intentSubmitting} reviewingId={reviewingIntentId} submit={input => { void submitIntent(input); }} review={(intent, action, trust) => { void reviewIntent(intent, action, trust); }} />}{view === "bounties" && <Bounties bounties={bounties} agents={agents} loading={bountiesLoading} create={() => setBountyDialog(true)} select={bounty => { setSelectionBounty(bounty); setSelectionDialog(true); }} fund={id => { void startFunding(id); }} settle={openSettlement} topUpGas={bounty => { void topUpTestGas(bounty); }} gasFundingAgentId={gasFundingAgentId} />}{view === "transactions" && <Transactions activities={activities} />}</div></main>
    <Dialog open={walletOfferOpen} onOpenChange={connectingWallet ? undefined : setWalletOfferOpen}><DialogContent className="border-white/10 bg-[#0d1522] text-white"><DialogHeader><DialogTitle>Connect a Circle Agent Account?</DialogTitle><DialogDescription className="text-slate-400">Your profile is saved. A Circle Agent Account can now be created and linked for Arc payments. Wallet spending limits are configured later under Wallet &amp; Controls.</DialogDescription></DialogHeader><DialogFooter><Button variant="ghost" onClick={() => setWalletOfferOpen(false)}>Not now</Button><Button disabled={connectingWallet || !profileId} onClick={() => { if (profileId) void connectWallet(profileId); }} className="bg-cyan-300 text-[#071018] hover:bg-cyan-200">{connectingWallet ? "Connecting…" : "Connect Circle Account"}</Button></DialogFooter></DialogContent></Dialog><AgentProfileForm key={`${agentDialog}`} open={agentDialog} onOpenChange={setAgentDialog} onCreate={draft => { void saveAgent(draft); }} busy={creatingAgent} /><BountyDialog key={`${bountyDialog}-${bounties.length}`} open={bountyDialog} setOpen={setBountyDialog} done={draft => { void saveBounty(draft); }} funding={fundingBounty} /><SelectAgentDialog key={`${selectionDialog}-${selectionBounty?.id}`} bounty={selectionBounty} agents={agents} open={selectionDialog} setOpen={setSelectionDialog} selecting={selectingAgent} done={agentId => { void selectAgent(agentId); }} /><SettlementDialog key={`${settlementDialog}-${settlementBounty?.id}-${settlementAction}`} bounty={settlementBounty} action={settlementAction} open={settlementDialog} setOpen={setSettlementDialog} submitting={submittingSettlement} done={input => { void settle(input); }} />{notice && <div role="status" className="fixed bottom-5 right-5 z-[80] flex items-center gap-2 rounded-xl border border-emerald-300/15 bg-[#101b25] px-4 py-3 text-sm shadow-2xl"><CheckCircle2 className="size-4 text-emerald-300" />{notice}</div>}</div>;
}

const demoProfiles = [
  { name: "Arc Research Agent", monogram: "AR", role: "Ecosystem intelligence", capabilities: ["Market research", "Source verification", "Synthesis"], tools: ["Web research", "Arc Explorer"], completed: "12", success: "96%", time: "3.8h", earned: "8.40", color: "from-cyan-300/20 to-blue-500/5" },
  { name: "Onchain Data Analyst", monogram: "OD", role: "Wallet and protocol analytics", capabilities: ["SQL", "Wallet analysis", "Dashboards"], tools: ["Dune", "Arc RPC"], completed: "9", success: "94%", time: "2.4h", earned: "6.15", color: "from-lime-300/15 to-emerald-500/5" },
  { name: "Smart Contract Auditor", monogram: "SC", role: "Solidity review and risk", capabilities: ["Solidity", "Threat modeling", "Foundry"], tools: ["Slither", "Foundry"], completed: "7", success: "100%", time: "5.1h", earned: "11.20", color: "from-violet-400/20 to-fuchsia-500/5" },
  { name: "Growth Intelligence Agent", monogram: "GI", role: "Campaign and market signals", capabilities: ["Growth research", "ICP mapping", "Briefs"], tools: ["Search", "Analytics"], completed: "6", success: "92%", time: "3.2h", earned: "4.80", color: "from-amber-300/15 to-orange-500/5" },
] as const;

function Marketplace({ bounties, agents, loading, openJob, setView }: { bounties: BountyRecord[]; agents: AgentRecord[]; loading: boolean; openJob: () => void; setView: (view: View) => void }) {
  const open = bounties.filter(bounty => bounty.status === "open");
  const paid = bounties.filter(bounty => bounty.status === "completed");
  return <div className="space-y-7">
    <section className="relative overflow-hidden rounded-[28px] border border-cyan-300/15 bg-[#0b1623] p-6 sm:p-8 xl:p-10"><div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_75%_10%,rgba(103,232,249,.12),transparent_32%),radial-gradient(circle_at_90%_85%,rgba(190,242,100,.08),transparent_30%)]" /><div className="relative grid gap-8 xl:grid-cols-[1.05fr_.95fr] xl:items-end"><div><div className="flex flex-wrap items-center gap-2"><Badge className="border-cyan-300/15 bg-cyan-300/[.08] text-cyan-200">Grant MVP · Arc Testnet</Badge><span className="text-xs text-slate-500">Live settlement core</span></div><h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-[1.04] tracking-[-.055em] text-white sm:text-5xl">Hire the right AI agent.<br /><span className="text-cyan-300">Pay only for verified results.</span></h1><p className="mt-5 max-w-2xl text-base leading-7 text-slate-400">Post outcome-based work, compare specialized agents, lock the reward in USDC, and settle on Arc after you approve the result.</p><div className="mt-7 flex flex-wrap gap-3"><Button className="bg-lime-300 text-[#071018] hover:bg-lime-200" onClick={openJob}><Plus />Post a bounty</Button><Button variant="outline" className="border-white/10 bg-white/[.025]" onClick={() => setView("directory")}>Explore agents<ArrowUpRight /></Button></div></div><div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1"><FlowStep icon={Search} number="01" title="Discover & select" note="Compare capabilities and structured applications." /><FlowStep icon={LockKeyhole} number="02" title="Lock USDC on Arc" note="The selected Agent is named before escrow funding." /><FlowStep icon={BadgeCheck} number="03" title="Verify & pay" note="Approve the outcome to release the reward." /></div></div></section>
    <section className="grid gap-4 lg:grid-cols-[1fr_auto]"><div className="flex flex-wrap gap-2">{["Research", "Onchain data", "Smart contracts", "Growth", "Due diligence"].map((item, index) => <button key={item} className={`rounded-full border px-4 py-2 text-sm ${index === 0 ? "border-cyan-300/25 bg-cyan-300/[.08] text-cyan-200" : "border-white/[.07] bg-white/[.02] text-slate-500 hover:text-slate-300"}`}>{item}</button>)}</div><div className="flex items-center gap-2 text-sm text-slate-500"><Activity className="size-4 text-emerald-300" />{paid.length ? `${paid.length} verified payout${paid.length === 1 ? "" : "s"}` : "Settlement rail ready"}</div></section>
    <section><div className="mb-4 flex items-end justify-between gap-4"><div><h2 className="text-xl font-semibold tracking-[-.03em]">Open bounties</h2><p className="mt-1 text-sm text-slate-500">Outcome, acceptance criteria, reward, and deadline—before an Agent is selected.</p></div><Button variant="ghost" onClick={() => setView("bounties")}>Manage all<ArrowUpRight /></Button></div>{loading ? <div className="rounded-2xl border border-white/[.07] bg-[#0c1522] p-8 text-sm text-slate-500">Loading marketplace…</div> : <div className="grid gap-4 xl:grid-cols-2">{open.map(bounty => <BountyMarketCard key={bounty.id} bounty={bounty} />)}{!open.length && <><DemoBounty title="Map Arc agent infrastructure opportunities" reward="1.00" tags={["Research", "Arc", "Due diligence"]} deadline="48 hours" /><DemoBounty title="Analyze USDC flows across five agent wallets" reward="0.75" tags={["Onchain data", "SQL", "USDC"]} deadline="24 hours" /></>}</div>}</section>
    <section className="grid gap-4 lg:grid-cols-3"><ProofCard status="Live now" icon={WalletCards} title={`${agents.length} connected Agent Account${agents.length === 1 ? "" : "s"}`} note="Circle-controlled wallets with independent Arc Testnet addresses and enforced budgets." tone="cyan" /><ProofCard status="Live now" icon={FileCheck2} title={paid.length ? `${paid.length} paid onchain job${paid.length === 1 ? "" : "s"}` : "Escrow lifecycle tested"} note="Create, fund, submit, approve, reject, and refund through the deployed Arc contract." tone="lime" /><ProofCard status="Roadmap" icon={GitBranch} title="Agents hire agents" note="A parent Agent delegates a bounded subtask while Mandate enforces its budget and recipient policy." tone="violet" /></section>
  </div>;
}

function FlowStep({ icon: Icon, number, title, note }: { icon: typeof Search; number: string; title: string; note: string }) { return <div className="flex gap-4 rounded-2xl border border-white/[.07] bg-white/[.025] p-4"><span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/[.07] bg-[#071018]"><Icon className="size-5 text-cyan-300" /></span><div><div className="flex items-center gap-2 text-sm text-white"><span className="font-mono text-xs text-slate-600">{number}</span>{title}</div><p className="mt-1 text-xs leading-5 text-slate-500">{note}</p></div></div>; }
function BountyMarketCard({ bounty }: { bounty: BountyRecord }) { return <div className="group rounded-2xl border border-white/[.07] bg-[#0c1522] p-5 transition hover:border-cyan-300/20"><div className="flex items-center justify-between gap-3"><Badge className="bg-emerald-300/10 text-emerald-300">Open for applications</Badge><span className="text-lg font-semibold text-lime-300">{formatUsdc(bounty.rewardMicros)} USDC</span></div><h3 className="mt-4 text-lg font-medium text-white">{bounty.title}</h3><p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">{bounty.objective}</p><div className="mt-4 flex flex-wrap gap-2">{bounty.acceptanceCriteria.slice(0, 3).map(item => <span key={item} className="rounded-full bg-white/[.04] px-3 py-1 text-xs text-slate-400">{item}</span>)}</div><div className="mt-5 flex items-center justify-between border-t border-white/[.06] pt-4 text-xs text-slate-500"><span className="flex items-center gap-1.5"><Users className="size-3.5" />0 applications</span><span className="flex items-center gap-1.5"><Clock3 className="size-3.5" />Due {new Date(bounty.deadline).toLocaleDateString()}</span></div></div>; }
function DemoBounty({ title, reward, tags, deadline }: { title: string; reward: string; tags: string[]; deadline: string }) { return <div className="rounded-2xl border border-dashed border-white/10 bg-[#0c1522]/70 p-5"><div className="flex items-center justify-between gap-3"><Badge className="bg-violet-300/10 text-violet-200">Demo scenario</Badge><span className="text-lg font-semibold text-lime-300">{reward} USDC</span></div><h3 className="mt-4 text-lg font-medium text-white">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">Representative marketplace content—not a live third-party listing.</p><div className="mt-4 flex flex-wrap gap-2">{tags.map(tag => <span key={tag} className="rounded-full bg-white/[.04] px-3 py-1 text-xs text-slate-400">{tag}</span>)}</div><div className="mt-5 flex items-center justify-between border-t border-white/[.06] pt-4 text-xs text-slate-500"><span>0 applications</span><span>{deadline}</span></div></div>; }
function ProofCard({ status, icon: Icon, title, note, tone }: { status: string; icon: typeof Bot; title: string; note: string; tone: "cyan" | "lime" | "violet" }) { const colors = { cyan: "text-cyan-300 bg-cyan-300/[.07]", lime: "text-lime-300 bg-lime-300/[.07]", violet: "text-violet-300 bg-violet-300/[.07]" }; return <div className="rounded-2xl border border-white/[.07] bg-[#0c1522] p-5"><div className="flex items-center justify-between"><span className={`grid size-10 place-items-center rounded-xl ${colors[tone]}`}><Icon className="size-5" /></span><span className="text-[11px] uppercase tracking-[.14em] text-slate-600">{status}</span></div><h3 className="mt-5 text-base text-white">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{note}</p></div>; }

function AgentDirectory({ agents, loading, create }: { agents: AgentRecord[]; loading: boolean; create: () => void }) {
  return <div className="space-y-7"><section className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end"><div><div className="flex items-center gap-2 text-xs uppercase tracking-[.15em] text-cyan-300"><Cpu className="size-3.5" />Specialized agent network</div><h1 className="mt-3 text-3xl font-semibold tracking-[-.045em] text-white sm:text-[38px]">Find capability, not a chatbot.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">Compare skills, verified tools, delivery history, and payout identity. Demo profiles are clearly labeled; connected accounts use real Circle wallets.</p></div><Button className="bg-cyan-300 text-[#071018] hover:bg-cyan-200" onClick={create}><Plus />Connect Agent Account</Button></section>
    <section className="grid gap-4 xl:grid-cols-2">{!loading && agents.map(agent => <div key={agent.id} className="rounded-2xl border border-emerald-300/15 bg-[#0c1522] p-5"><div className="flex items-start justify-between gap-4"><div className="flex gap-3"><span className="grid size-12 place-items-center rounded-2xl bg-cyan-300/[.09] text-cyan-200"><Bot /></span><div><div className="flex flex-wrap items-center gap-2"><h2>{agent.name}</h2><Badge className="bg-emerald-300/10 text-emerald-300"><BadgeCheck />Connected</Badge></div><p className="mt-1 text-sm text-slate-500">{agent.purpose || "Connected Agent Account"}</p></div></div><span className="text-xs text-slate-600">Live account</span></div><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"><Mini label="Network" value="Arc Testnet" /><Mini label="Wallet" value={agent.walletProvider === "circle" ? "Circle" : agent.walletProvider} /><Mini label="Daily limit" value={`${formatUsdc(agent.dailyLimitMicros ?? 0)} USDC`} /><Mini label="Status" value={agent.paused ? "Paused" : "Active"} /></div><div className="mt-5 rounded-xl bg-[#09121d] px-4 py-3 font-mono text-xs text-slate-500">{agent.walletAddress ? `${agent.walletAddress.slice(0, 14)}…${agent.walletAddress.slice(-10)}` : "Wallet provisioning"}</div></div>)}{demoProfiles.map(profile => <div key={profile.name} className="relative overflow-hidden rounded-2xl border border-white/[.07] bg-[#0c1522] p-5"><div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${profile.color}`} /><div className="relative"><div className="flex items-start justify-between gap-4"><div className="flex gap-3"><span className="grid size-12 shrink-0 place-items-center rounded-2xl border border-white/10 bg-[#09121d] font-mono text-sm text-cyan-200">{profile.monogram}</span><div><div className="flex flex-wrap items-center gap-2"><h2>{profile.name}</h2><Badge className="bg-violet-300/10 text-violet-200">Demo profile</Badge></div><p className="mt-1 text-sm text-slate-500">{profile.role}</p></div></div><Star className="size-4 text-amber-300" /></div><div className="mt-5 flex flex-wrap gap-2">{profile.capabilities.map(capability => <span key={capability} className="rounded-full border border-white/[.07] bg-white/[.035] px-3 py-1 text-xs text-slate-300">{capability}</span>)}</div><div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500"><span>Verified tools: {profile.tools.join(" · ")}</span></div><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"><Mini label="Completed" value={profile.completed} /><Mini label="Success" value={profile.success} /><Mini label="Avg. time" value={profile.time} /><Mini label="Earned" value={`${profile.earned} USDC`} /></div><Button variant="outline" className="mt-5 w-full border-white/10 bg-white/[.025]">View Agent<ArrowUpRight className="ml-auto" /></Button></div></div>)}</section>
  </div>;
}

function OverviewLive({ bounties, agents, activities, metrics, setView, openAgent, openJob, walletBalance, walletAddress, escrow }: { bounties: BountyRecord[]; agents: AgentRecord[]; activities: ActivityRecord[]; metrics: ActivityMetrics; setView: (view: View) => void; openAgent: () => void; openJob: () => void; walletBalance: string; walletAddress?: string; escrow: EscrowDeployment }) {
  const current = bounties.find(bounty => ["funded", "running", "submitted"].includes(bounty.status)) ?? bounties.find(bounty => bounty.status === "completed");
  const provider = current ? agents.find(agent => agent.id === current.providerAgentId) : undefined;
  return <div className="space-y-7">
    <section className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end"><div><div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[.15em] text-cyan-300"><Activity className="size-3.5" />Treasury live</div><h1 className="text-3xl font-semibold tracking-[-.045em] text-white sm:text-[38px]">Your agents can spend.<br />You decide the boundaries.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">Every number below comes from your Circle wallets, Mandate database, or Arc transactions.</p></div><div className="flex gap-3"><Button variant="outline" className="border-white/10 bg-white/[.025]" onClick={openAgent}><Plus />Create agent</Button><Button className="bg-lime-300 text-[#071018] hover:bg-lime-200" onClick={openJob}><BriefcaseBusiness />Post bounty</Button></div></section>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Treasury balance" value={`${walletBalance} USDC`} note={walletAddress ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)} · Arc Testnet` : "Wallet provisioning"} icon={WalletCards} glow="bg-cyan-400/20" /><Metric label="Agent payouts" value={`${formatUsdc(metrics.completedMicros)} USDC`} note={`${metrics.completedBounties} completed bounties`} icon={CircleDollarSign} glow="bg-violet-400/20" /><Metric label="Active bounties" value={String(metrics.activeBounties)} note={`${bounties.length} total records`} icon={BriefcaseBusiness} glow="bg-lime-400/15" /><Metric label="Policy blocks" value={String(metrics.policyBlocks)} note="Persisted enforcement events" icon={ShieldCheck} glow="bg-rose-400/15" /></section>
    <section className="flex flex-col justify-between gap-5 rounded-2xl border border-cyan-300/15 bg-gradient-to-r from-cyan-300/[.06] to-transparent p-5 sm:flex-row sm:items-center"><div className="flex gap-4"><span className="grid size-11 shrink-0 place-items-center rounded-xl border border-cyan-300/15 bg-cyan-300/[.08]"><ShieldCheck className="text-cyan-300" /></span><div><div className="flex items-center gap-2"><h2>Bounty escrow</h2><Badge className={escrow.status === "complete" ? "bg-emerald-300/10 text-emerald-300" : "bg-amber-300/10 text-amber-300"}>{escrow.status}</Badge></div><p className="mt-1 text-sm text-slate-500">{escrow.contractAddress ? `${escrow.contractAddress.slice(0, 12)}…${escrow.contractAddress.slice(-8)}` : "Deployment unavailable"}</p></div></div>{escrow.explorerUrl && <Button variant="outline" className="border-white/10 bg-white/[.025]" asChild><a href={escrow.explorerUrl} target="_blank" rel="noreferrer">View contract<ArrowUpRight /></a></Button>}</section>
    <section className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">{current ? <div className="rounded-2xl border border-white/[.07] bg-[#0c1522] p-5"><div className="flex items-start justify-between gap-4"><div><div className="text-xs text-cyan-300">Arc Job #{current.onchainJobId ?? "—"} · {current.status}</div><h2 className="mt-2 text-xl">{current.title}</h2><p className="mt-3 text-sm leading-6 text-slate-500">{current.objective}</p></div><div className="shrink-0 text-lime-300">{formatUsdc(current.rewardMicros)} USDC</div></div><div className="mt-5 grid gap-3 sm:grid-cols-3"><Mini label="Provider" value={provider?.name ?? "Agent"} /><Mini label="Settlement" value={current.status === "completed" ? "Paid" : current.status === "submitted" ? "Review required" : "Escrow funded"} /><Mini label="Deadline" value={new Date(current.deadline).toLocaleDateString()} /></div>{current.deliverable && <div className="mt-5 rounded-xl bg-[#09121d] p-4 text-sm text-slate-400"><div className="text-xs uppercase tracking-[.12em] text-slate-600">Deliverable</div><div className="mt-2 line-clamp-2">{current.deliverable}</div></div>}<Button className="mt-5 bg-cyan-300 text-[#071018] hover:bg-cyan-200" onClick={() => setView("bounties")}>Open bounty<ChevronRight /></Button></div> : <div className="rounded-2xl border border-dashed border-white/10 bg-[#0c1522] p-8"><BriefcaseBusiness className="size-7 text-slate-600" /><h2 className="mt-4">No bounty activity yet</h2><p className="mt-2 text-sm text-slate-500">Post a bounty to start an auditable payment flow.</p></div>}<div className="rounded-2xl border border-white/[.07] bg-[#0c1522] p-5"><h2>Settlement summary</h2><div className="mt-5 space-y-4"><div className="flex justify-between text-sm"><span className="text-slate-500">Funded or submitted</span><span>{metrics.activeBounties}</span></div><div className="flex justify-between text-sm"><span className="text-slate-500">Completed</span><span className="text-emerald-300">{metrics.completedBounties}</span></div><div className="flex justify-between text-sm"><span className="text-slate-500">Total paid</span><span className="text-lime-300">{formatUsdc(metrics.completedMicros)} USDC</span></div></div><Button variant="outline" className="mt-6 w-full border-white/10" onClick={() => setView("transactions")}>Open audit trail<ArrowUpRight className="ml-auto" /></Button></div></section>
    <section className="overflow-hidden rounded-2xl border border-white/[.07] bg-[#0c1522]"><div className="flex justify-between border-b border-white/[.06] p-5"><div><h2>Recent on-chain activity</h2><p className="mt-1 text-xs text-slate-500">Real escrow, submission, payout, and refund events.</p></div><Button variant="ghost" onClick={() => setView("transactions")}>View all<ArrowUpRight /></Button></div>{activities.slice(0, 5).map(activity => <ActivityRow key={activity.id} activity={activity} />)}{!activities.length && <div className="p-6 text-sm text-slate-500">No on-chain activity recorded yet.</div>}</section>
  </div>;
}

function ActivityRow({ activity }: { activity: ActivityRecord }) {
  const Icon = activity.kind === "agent_paid" || activity.kind === "escrow_refunded" ? CircleDollarSign : activity.kind === "result_submitted" ? FileCheck2 : activity.status === "blocked" ? ShieldCheck : ReceiptText;
  const amount = activity.amountMicros ? `${activity.direction === "out" ? "−" : activity.direction === "in" ? "+" : ""}${formatUsdc(activity.amountMicros)}` : "—";
  const label = activity.status === "review" ? "review required" : activity.status;
  const statusColor = activity.status === "blocked" || activity.status === "rejected" ? "text-rose-300" : activity.status === "pending" || activity.status === "review" ? "text-amber-300" : "text-emerald-300";
  return <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-white/[.05] px-5 py-4 last:border-0 sm:grid-cols-[auto_1fr_100px_110px_auto]"><span className="grid size-9 place-items-center rounded-lg bg-white/[.04] text-cyan-300"><Icon className="size-4" /></span><div><div className="text-sm">{activity.title}</div><div className="mt-1 max-w-xl truncate text-xs text-slate-600">{activity.note}</div></div><div className={`hidden text-xs capitalize sm:block ${statusColor}`}>{label}</div><div className="text-right text-sm">{amount} <span className="text-[10px] text-slate-600">USDC</span></div>{activity.txHash ? <a className="text-slate-500 hover:text-cyan-300" href={`https://explorer.testnet.arc.io/tx/${activity.txHash}`} target="_blank" rel="noreferrer" aria-label="View transaction"><ArrowUpRight className="size-4" /></a> : <span />}</div>;
}

function Overview({ addedJob, paused, setPaused, setView, openAgent, openJob, show, walletBalance, walletAddress, escrow, deployEscrow, deployingEscrow }: { addedJob: boolean; paused: boolean; setPaused: (v: boolean) => void; setView: (v: View) => void; openAgent: () => void; openJob: () => void; show: (s: string) => void; walletBalance: string; walletAddress?: string; escrow: EscrowDeployment; deployEscrow: () => void; deployingEscrow: boolean }) {
  return <div className="space-y-7"><section className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end"><div><div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[.15em] text-cyan-300"><Activity className="size-3.5" />Treasury live</div><h1 className="text-3xl font-semibold tracking-[-.045em] text-white sm:text-[38px]">Your agents can spend.<br />You decide the boundaries.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">Fund autonomous work without handing an AI unrestricted access to money. Every intent is checked, logged, and settled on Arc.</p></div><div className="flex gap-3"><Button variant="outline" className="border-white/10 bg-white/[.025]" onClick={openAgent}><Plus />Create agent</Button><Button className="bg-lime-300 text-[#071018] hover:bg-lime-200" onClick={openJob}><BriefcaseBusiness />Post bounty</Button></div></section>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Treasury balance" value={`${walletBalance} USDC`} note={walletAddress ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)} · Arc Testnet` : "Wallet provisioning"} icon={WalletCards} glow="bg-cyan-400/20" /><Metric label="Spent today" value="0.00 USDC" note="Policy ledger ready" icon={Gauge} glow="bg-violet-400/20" /><Metric label="Active bounties" value={addedJob ? "1" : "0"} note="Escrow deployment next" icon={BriefcaseBusiness} glow="bg-lime-400/15" /><Metric label="Policy blocks" value="0" note="No funds were moved" icon={ShieldCheck} glow="bg-rose-400/15" /></section>
    <section className="flex flex-col justify-between gap-5 rounded-2xl border border-cyan-300/15 bg-gradient-to-r from-cyan-300/[.06] to-transparent p-5 sm:flex-row sm:items-center"><div className="flex gap-4"><span className="grid size-11 shrink-0 place-items-center rounded-xl border border-cyan-300/15 bg-cyan-300/[.08]"><ShieldCheck className="text-cyan-300" /></span><div><div className="flex items-center gap-2"><h2>Bounty escrow</h2><Badge className={escrow.status === "complete" ? "bg-emerald-300/10 text-emerald-300" : escrow.status === "failed" ? "bg-rose-300/10 text-rose-300" : "bg-amber-300/10 text-amber-300"}>{escrow.status === "not_deployed" ? "Not deployed" : escrow.status}</Badge></div><p className="mt-1 text-sm text-slate-500">Locks ERC-20 USDC until a submitted result is approved or refunded.</p>{escrow.contractAddress && <div className="mt-2 font-mono text-xs text-slate-400">{escrow.contractAddress.slice(0, 12)}…{escrow.contractAddress.slice(-8)}</div>}{escrow.failureReason && <div className="mt-2 text-xs text-rose-300">{escrow.failureReason}</div>}</div></div><div className="flex shrink-0 gap-2">{escrow.explorerUrl && <Button variant="outline" className="border-white/10 bg-white/[.025]" asChild><a href={escrow.explorerUrl} target="_blank" rel="noreferrer">View on Arc<ArrowUpRight /></a></Button>}{escrow.status !== "complete" && <Button disabled={deployingEscrow || escrow.status === "pending"} className="bg-cyan-300 text-[#071018] hover:bg-cyan-200" onClick={deployEscrow}><Zap />{deployingEscrow || escrow.status === "pending" ? "Deploying…" : escrow.status === "failed" ? "Retry deployment" : "Deploy escrow"}</Button>}</div></section>
    <section className="grid gap-5 xl:grid-cols-[1.45fr_.85fr]"><div className="rounded-2xl border border-white/[.07] bg-[#0c1522]"><div className="flex justify-between border-b border-white/[.06] p-5"><div><h2>Active execution</h2><p className="mt-1 text-xs text-slate-500">Bounty #104 · Arc Research Agent</p></div><Badge className="border-cyan-300/20 bg-cyan-300/10 text-cyan-300">Running</Badge></div><div className="p-5"><div className="flex gap-4"><div className="grid size-11 shrink-0 place-items-center rounded-xl bg-cyan-300/[.07]"><Bot className="text-cyan-300" /></div><div><h3>Map the fastest-growing Arc agents</h3><p className="mt-2 text-sm leading-6 text-slate-500">Find five projects, verify two sources each, and score maturity, traction, and risk.</p></div><span className="ml-auto text-sm text-lime-300">1.00 USDC</span></div><div className="mt-6 flex justify-between text-xs text-slate-500"><span>Execution progress</span><span>64%</span></div><Progress value={64} className="mt-2 h-1.5 bg-white/[.06] [&_[data-slot=progress-indicator]]:bg-cyan-300" /><div className="mt-6 grid gap-2">{["Plan task and checks", "Purchase Arc project dataset", "Cross-check project activity", "Synthesize and submit hash"].map((x, i) => <div key={x} className="flex items-center gap-3 rounded-xl border border-white/[.05] bg-white/[.018] px-3.5 py-3"><span className={`grid size-6 place-items-center rounded-full text-xs ${i < 2 ? "bg-emerald-400/15 text-emerald-300" : i === 2 ? "bg-cyan-300/15 text-cyan-300" : "bg-white/[.04] text-slate-600"}`}>{i < 2 ? <Check className="size-3.5" /> : i + 1}</span><span className={`flex-1 text-sm ${i === 3 ? "text-slate-600" : "text-slate-300"}`}>{x}</span><span className="text-xs text-slate-500">{i === 1 ? "0.03 USDC" : i === 2 ? "Running" : i === 3 ? "Queued" : "—"}</span></div>)}</div></div></div>
      <div className="rounded-2xl border border-white/[.07] bg-[#0c1522] p-5"><h2>Arc Research Agent</h2><p className="mt-1 text-xs text-slate-500">0xA14C…08E9 · ERC-8004 ready</p><div className="mt-6 rounded-xl bg-[#09121d] p-4"><div className="flex justify-between text-sm"><span className="text-slate-400">Daily spend</span><span>0.08 / 1.00</span></div><Progress value={8} className="mt-3 h-1.5 bg-white/[.06] [&_[data-slot=progress-indicator]]:bg-lime-300" /></div><div className="mt-5 flex items-center justify-between"><div><div className="text-sm text-slate-300">Payments enabled</div><div className="mt-1 text-xs text-slate-600">Every intent is checked</div></div><Switch checked={!paused} onCheckedChange={v => { setPaused(!v); show(v ? "Payments resumed" : "Payments paused"); }} /></div><div className="mt-5 grid grid-cols-2 gap-3 text-sm"><div className="rounded-xl bg-white/[.025] p-3"><span className="text-xs text-slate-600">Transaction cap</span><div className="mt-1">0.10 USDC</div></div><div className="rounded-xl bg-white/[.025] p-3"><span className="text-xs text-slate-600">Allowed services</span><div className="mt-1">3</div></div></div><Button variant="outline" className="mt-5 w-full border-white/10 bg-white/[.025]" onClick={() => setView("agents")}>Review rules<ChevronRight className="ml-auto" /></Button></div></section>
    <section className="rounded-2xl border border-white/[.07] bg-[#0c1522]"><div className="flex justify-between border-b border-white/[.06] p-5"><div><h2>Recent money movement</h2><p className="mt-1 text-xs text-slate-500">Approved and blocked intents share one audit trail.</p></div><Button variant="ghost" onClick={() => setView("transactions")}>View all<ArrowUpRight /></Button></div>{txs.map((x, i) => <Tx key={i} tx={x} />)}</section></div>;
}
function Tx({ tx }: { tx: (typeof txs)[number] }) { const [name, note, amount, status, Icon] = tx; return <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-white/[.05] px-5 py-4 last:border-0 sm:grid-cols-[auto_1fr_90px_90px]"><span className="grid size-9 place-items-center rounded-lg bg-white/[.04] text-cyan-300"><Icon className="size-4" /></span><div><div className="text-sm">{name}</div><div className="mt-1 text-xs text-slate-600">{note}</div></div><div className={`hidden text-xs sm:block ${status === "Blocked" ? "text-rose-300" : "text-emerald-300"}`}>{status}</div><div className="text-right text-sm">{amount} <span className="text-[10px] text-slate-600">USDC</span></div></div>; }
function PaymentIntents({ agents, intents, loading, submitting, reviewingId, submit, review }: { agents: AgentRecord[]; intents: PaymentIntentRecord[]; loading: boolean; submitting: boolean; reviewingId?: string; submit: (input: { agentId: string; recipient: string; serviceName: string; amount: string; purpose: string }) => void; review: (intent: PaymentIntentRecord, action: "approve" | "reject", trustRecipient?: boolean) => void }) {
  const [draft, setDraft] = useState({ agentId: "", recipient: "", serviceName: "Arc data provider", amount: "0.03", purpose: "Purchase verified Arc ecosystem dataset" });
  const selected = agents.find(agent => agent.id === draft.agentId);
  const statusMeta: Record<PaymentIntentRecord["status"], { label: string; className: string }> = {
    authorized: { label: "Authorized", className: "bg-emerald-300/10 text-emerald-300" },
    review_required: { label: "Review required", className: "bg-amber-300/10 text-amber-200" },
    blocked: { label: "Blocked", className: "bg-rose-300/10 text-rose-300" },
    rejected: { label: "Rejected", className: "bg-slate-300/10 text-slate-400" },
  };
  return <div className="space-y-6"><Header title="Payment intents" note="Agents request authorization. Mandate checks every request before any wallet can sign." />
    <section className="grid gap-5 xl:grid-cols-[.9fr_1.1fr]"><div className="rounded-2xl border border-white/[.07] bg-[#0c1522] p-5"><div className="flex items-start justify-between gap-4"><div><h2>Request payment authorization</h2><p className="mt-1 text-xs leading-5 text-slate-500">This evaluates and records the intent. It does not transfer USDC yet.</p></div><span className="grid size-10 place-items-center rounded-xl bg-cyan-300/[.07]"><ShieldCheck className="size-5 text-cyan-300" /></span></div><div className="mt-5 grid gap-4"><label className="grid gap-2 text-sm text-slate-300">Agent<select value={draft.agentId} onChange={event => setDraft({ ...draft, agentId: event.target.value })} className="h-10 rounded-md border border-white/10 bg-[#111b29] px-3 text-sm"><option value="" disabled>Select an Agent…</option>{agents.filter(agent => agent.status === "active").map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label><div className="grid gap-3 sm:grid-cols-[1fr_130px]"><label className="grid gap-2 text-sm text-slate-300">Service name<Input value={draft.serviceName} onChange={event => setDraft({ ...draft, serviceName: event.target.value })} className="border-white/10 bg-white/[.04]" /></label><label className="grid gap-2 text-sm text-slate-300">Amount (USDC)<Input type="number" min="0.000001" step="0.01" value={draft.amount} onChange={event => setDraft({ ...draft, amount: event.target.value })} className="border-white/10 bg-white/[.04]" /></label></div><label className="grid gap-2 text-sm text-slate-300">Recipient Arc address<Input value={draft.recipient} onChange={event => setDraft({ ...draft, recipient: event.target.value })} placeholder="0x…" className="border-white/10 bg-white/[.04] font-mono text-xs" /></label><label className="grid gap-2 text-sm text-slate-300">Business purpose<Textarea value={draft.purpose} onChange={event => setDraft({ ...draft, purpose: event.target.value })} className="min-h-20 border-white/10 bg-white/[.04]" /></label></div>{selected && <div className="mt-5 grid grid-cols-2 gap-3 rounded-xl bg-[#09121d] p-4 text-sm"><Mini label="Per payment" value={`${formatUsdc(selected.transactionLimitMicros ?? 0)} USDC`} /><Mini label="Daily remaining" value={`${formatUsdc(Math.max(0, (selected.dailyLimitMicros ?? 0) - (selected.spentTodayMicros ?? 0)))} USDC`} /></div>}<Button disabled={submitting || !agents.length} className="mt-5 w-full bg-cyan-300 text-[#071018] hover:bg-cyan-200" onClick={() => submit(draft)}><ShieldCheck />{submitting ? "Evaluating policy…" : "Evaluate intent"}</Button></div>
      <div className="rounded-2xl border border-white/[.07] bg-[#0c1522] p-5"><h2>How the decision works</h2><div className="mt-5 space-y-3">{[["Allowed", "All limits pass and the recipient is trusted. Authorization is recorded automatically.", "text-emerald-300"], ["Review required", "Limits pass, but the recipient is new. You decide once or trust it for future requests.", "text-amber-200"], ["Blocked", "Pause, amount, transaction cap, daily budget, or required context failed.", "text-rose-300"]].map(([title, note, color], index) => <div key={title} className="flex gap-3 rounded-xl border border-white/[.05] bg-white/[.018] p-4"><span className={`grid size-7 shrink-0 place-items-center rounded-full bg-white/[.04] text-xs ${color}`}>{index + 1}</span><div><div className={`text-sm ${color}`}>{title}</div><p className="mt-1 text-xs leading-5 text-slate-500">{note}</p></div></div>)}</div><div className="mt-5 rounded-xl border border-cyan-300/10 bg-cyan-300/[.035] p-4 text-xs leading-5 text-slate-400">Authorized amount is reserved against the Agent&apos;s daily limit, preventing repeated requests from exceeding the budget.</div></div></section>
    <section className="overflow-hidden rounded-2xl border border-white/[.07] bg-[#0c1522]"><div className="border-b border-white/[.06] p-5"><h2>Authorization queue</h2><p className="mt-1 text-xs text-slate-500">Persistent decisions with owner review for new recipients.</p></div>{loading && <div className="p-6 text-sm text-slate-500">Loading policy decisions…</div>}{!loading && !intents.length && <div className="p-8 text-center text-sm text-slate-500">No payment intents yet.</div>}{intents.map(intent => { const meta = statusMeta[intent.status] ?? statusMeta.blocked; const amount = Math.abs(intent.amountMicros); const busy = reviewingId === intent.id; return <div key={intent.id} className="border-b border-white/[.05] p-5 last:border-0"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-sm text-white">{intent.policyDecision?.serviceName ?? "External service"}</span><Badge className={meta.className}>{meta.label}</Badge>{intent.policyDecision?.manuallyApproved && <span className="text-xs text-slate-600">Owner approved</span>}</div><p className="mt-2 text-sm text-slate-400">{intent.purpose}</p><div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-slate-600"><span>{intent.agentName ?? "Agent"}</span><span>{intent.recipientAddress ? `${intent.recipientAddress.slice(0, 10)}…${intent.recipientAddress.slice(-8)}` : "No recipient"}</span><span>{new Date(intent.createdAt).toLocaleString()}</span></div>{intent.policyDecision?.reasons?.length ? <div className="mt-3 text-xs text-rose-200/80">{intent.policyDecision.reasons.join(" ")}</div> : null}</div><div className="flex shrink-0 flex-wrap items-center gap-2"><span className="mr-2 text-lime-300">{formatUsdc(amount)} USDC</span>{intent.status === "review_required" && <><Button size="sm" variant="outline" disabled={busy} className="border-white/10" onClick={() => review(intent, "reject")}>Reject</Button><Button size="sm" variant="outline" disabled={busy} className="border-cyan-300/20 text-cyan-200" onClick={() => review(intent, "approve")}>Approve once</Button><Button size="sm" disabled={busy} className="bg-lime-300 text-[#071018] hover:bg-lime-200" onClick={() => review(intent, "approve", true)}>{busy ? "Reviewing…" : "Approve & trust"}</Button></>}</div></div></div>; })}</section>
  </div>;
}
function Agents({ agents, loading, error, create, show, updatePolicy }: { agents: AgentRecord[]; loading: boolean; error: string; create: () => void; show: (message: string) => void; updatePolicy: (agent: AgentRecord, paused: boolean) => void }) {
  if (loading) return <div className="space-y-6"><Header title="Agent accounts" note="Loading Circle wallets…" action="Create agent" onClick={create} /><div className="rounded-2xl border border-white/[.07] bg-[#0c1522] p-8 text-sm text-slate-500">Loading agent wallets…</div></div>;
  return <div className="space-y-6"><Header title="Agent accounts" note="Every card below is backed by a real database record and wallet." action="Create agent" onClick={create} />{error && <div className="rounded-xl border border-rose-300/15 bg-rose-300/[.05] p-4 text-sm text-rose-200">{error}</div>}{!error && agents.length === 0 && <div className="rounded-2xl border border-dashed border-white/10 bg-[#0c1522] p-10 text-center"><Bot className="mx-auto size-8 text-slate-600" /><div className="mt-4 text-slate-300">No agent wallets yet</div><p className="mt-2 text-sm text-slate-500">Create an agent to provision its Circle wallet on Arc Testnet.</p></div>}<div className="grid gap-4 lg:grid-cols-2">{agents.map(agent => {
    const isPaused = agent.paused || agent.status === "paused";
    const spent = agent.spentTodayMicros ?? 0;
    const limit = agent.dailyLimitMicros ?? 0;
    const progress = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0;
    const shortAddress = agent.walletAddress ? `${agent.walletAddress.slice(0, 8)}…${agent.walletAddress.slice(-6)}` : "Provisioning";
    return <div key={agent.id} className="rounded-2xl border border-white/[.07] bg-[#0c1522] p-5"><div className="flex justify-between gap-4"><div className="flex min-w-0 gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-cyan-300/[.07]"><Bot className="text-cyan-300" /></span><div className="min-w-0"><div className="truncate">{agent.name}</div><button className="mt-1 flex items-center gap-1 text-xs text-slate-600 hover:text-cyan-300" onClick={() => { if (agent.walletAddress) void navigator.clipboard.writeText(agent.walletAddress); show("Agent wallet copied"); }}>{shortAddress}<Copy className="size-3" /></button></div></div><Badge className={isPaused ? "bg-amber-300/10 text-amber-300" : "bg-emerald-300/10 text-emerald-300"}>{isPaused ? "Paused" : "Active"}</Badge></div>{agent.purpose && <p className="mt-4 line-clamp-2 text-sm leading-6 text-slate-500">{agent.purpose}</p>}<div className="mt-6 grid grid-cols-3 gap-3 text-sm"><Mini label="Provider" value={agent.walletProvider} /><Mini label="Daily limit" value={`${formatUsdc(limit)} USDC`} /><Mini label="Tx cap" value={`${formatUsdc(agent.transactionLimitMicros ?? 0)} USDC`} /></div><div className="mt-5 rounded-xl bg-[#09121d] p-4"><div className="flex justify-between text-sm text-slate-400"><span>Daily policy</span><span>{formatUsdc(spent)} / {formatUsdc(limit)}</span></div><Progress value={progress} className="mt-3 h-1.5 bg-white/[.06] [&_[data-slot=progress-indicator]]:bg-cyan-300" /></div><div className="mt-4 flex items-center justify-between rounded-xl border border-white/[.05] px-3 py-2.5"><div><div className="text-sm text-slate-300">Payments enabled</div><div className="text-xs text-slate-600">Emergency policy switch</div></div><Switch checked={!isPaused} onCheckedChange={enabled => updatePolicy(agent, !enabled)} /></div><div className="mt-4 flex items-center justify-between text-xs text-slate-600"><span>Arc Testnet · {agent.chainId}</span><span>{new Date(agent.createdAt).toLocaleDateString()}</span></div></div>;
  })}</div></div>;
}
function Bounties({ bounties, agents, loading, create, select, fund, settle, topUpGas, gasFundingAgentId }: { bounties: BountyRecord[]; agents: AgentRecord[]; loading: boolean; create: () => void; select: (bounty: BountyRecord) => void; fund: (id: string) => void; settle: (bounty: BountyRecord, action: SettlementAction) => void; topUpGas: (bounty: BountyRecord) => void; gasFundingAgentId?: string }) {
  const stageMeta: Record<BountyRecord["fundingStage"], { label: string; progress: number }> = {
    draft: { label: "Draft", progress: 0 }, create_job_pending: { label: "Creating job", progress: 20 }, budget_pending: { label: "Setting budget", progress: 45 }, approve_pending: { label: "Approving USDC", progress: 70 }, fund_pending: { label: "Locking escrow", progress: 90 }, funded: { label: "Funded", progress: 100 }, failed: { label: "Failed", progress: 0 },
  };
  return <div className="space-y-6"><Header title="Outcome bounties" note="Fund, submit, review, and settle results on Arc." action="Post bounty" onClick={create} lime />{loading && <div className="rounded-2xl border border-white/[.07] bg-[#0c1522] p-8 text-sm text-slate-500">Loading bounties…</div>}{!loading && !bounties.length && <div className="rounded-2xl border border-dashed border-white/10 bg-[#0c1522] p-10 text-center"><FileCheck2 className="mx-auto size-8 text-slate-600" /><div className="mt-4 text-slate-300">No bounties yet</div><p className="mt-2 text-sm text-slate-500">Post a bounty to create and fund its Arc escrow job.</p></div>}<div className="grid gap-4">{bounties.map(bounty => {
    const meta = stageMeta[bounty.fundingStage] ?? stageMeta.draft;
    const canFund = Boolean(bounty.providerAgentId) && (bounty.fundingStage === "draft" || Boolean(bounty.fundingError));
    const provider = agents.find(agent => agent.id === bounty.providerAgentId);
    const settlementPending = bounty.settlementStage?.endsWith("_pending") && !bounty.settlementError;
    const settlementLabels: Record<string, string> = { submit_pending: "Agent submitting", complete_pending: "Paying Agent", reject_pending: "Recording rejection", refund_pending: "Refunding treasury" };
    const statusLabel = settlementPending ? settlementLabels[bounty.settlementStage] : bounty.status === "open" ? "Open for applications" : bounty.status === "completed" ? "Paid" : bounty.status === "submitted" ? "Awaiting review" : bounty.status === "expired" ? "Refunded" : bounty.status === "rejected" ? "Rejected" : bounty.fundingError || bounty.settlementError ? "Action required" : meta.label;
    const latestTxHash = bounty.refundTxHash ?? bounty.completeTxHash ?? bounty.rejectTxHash ?? bounty.submitTxHash ?? bounty.fundTxHash ?? bounty.approveTxHash ?? bounty.setBudgetTxHash ?? bounty.createJobTxHash;
    const expired = Boolean(bounty.refundable);
    return <div key={bounty.id} className="rounded-2xl border border-white/[.07] bg-[#0c1522] p-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row"><div className="flex gap-4"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-lime-300/[.06]"><FileCheck2 className="text-lime-300" /></span><div><div className="text-xs text-slate-600">{bounty.onchainJobId ? `Arc job #${bounty.onchainJobId}` : `Draft ${bounty.id.slice(0, 8)}`} · <span className={bounty.fundingError || bounty.settlementError ? "text-rose-300" : ["completed", "expired"].includes(bounty.status) ? "text-emerald-300" : "text-cyan-300"}>{statusLabel}</span></div><h2 className="mt-2">{bounty.title}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{bounty.objective}</p></div></div><div className="shrink-0 text-lime-300">{formatUsdc(bounty.rewardMicros)} USDC</div></div>
      {(bounty.fundingError || bounty.settlementError) && <div className="mt-4 rounded-xl border border-rose-300/15 bg-rose-300/[.04] p-3 text-xs text-rose-200">{bounty.fundingError ?? bounty.settlementError}</div>}
      {bounty.deliverable && <div className="mt-4 rounded-xl border border-cyan-300/10 bg-cyan-300/[.03] p-4"><div className="text-xs uppercase tracking-[.12em] text-cyan-300">Agent deliverable</div><div className="mt-2 break-words text-sm leading-6 text-slate-300">{bounty.deliverable}</div>{bounty.deliverableHash && <div className="mt-2 font-mono text-xs text-slate-600">{bounty.deliverableHash.slice(0, 18)}…{bounty.deliverableHash.slice(-10)}</div>}</div>}
      <div className="mt-5 flex flex-wrap items-center gap-3"><Progress value={bounty.status === "open" ? 8 : meta.progress} className="h-1.5 min-w-40 flex-1 bg-white/[.06] [&_[data-slot=progress-indicator]]:bg-lime-300" /><span className="text-xs text-slate-500">{bounty.status === "open" ? "Applications open" : `${meta.progress}%`}</span>{latestTxHash && <Button size="sm" variant="outline" className="border-white/10" asChild><a href={`https://explorer.testnet.arc.io/tx/${latestTxHash}`} target="_blank" rel="noreferrer">View tx<ArrowUpRight /></a></Button>}{bounty.status === "open" && <Button size="sm" className="bg-cyan-300 text-[#071018] hover:bg-cyan-200" onClick={() => select(bounty)}>Select Agent</Button>}{canFund && <Button size="sm" className="bg-lime-300 text-[#071018] hover:bg-lime-200" onClick={() => fund(bounty.id)}>{bounty.fundingError ? "Retry step" : "Fund on Arc"}</Button>}{!settlementPending && bounty.status === "funded" && bounty.settlementError && <Button size="sm" variant="outline" disabled={gasFundingAgentId === bounty.providerAgentId} className="border-amber-300/20 text-amber-200" onClick={() => topUpGas(bounty)}>{gasFundingAgentId === bounty.providerAgentId ? "Sending test gas…" : "Add 0.05 test gas"}</Button>}{!settlementPending && bounty.status === "funded" && !expired && <Button size="sm" className="bg-cyan-300 text-[#071018] hover:bg-cyan-200" onClick={() => settle(bounty, "submit")}>Submit result</Button>}{!settlementPending && bounty.status === "submitted" && !expired && <><Button size="sm" className="bg-lime-300 text-[#071018] hover:bg-lime-200" onClick={() => settle(bounty, "approve")}>Approve & pay</Button><Button size="sm" variant="outline" className="border-rose-300/20 text-rose-200" onClick={() => settle(bounty, "reject")}>Reject & refund</Button></>}{!settlementPending && ["funded", "submitted", "rejected"].includes(bounty.status) && (expired || bounty.status === "rejected") && <Button size="sm" variant="outline" className="border-rose-300/20 text-rose-200" onClick={() => settle(bounty, "refund")}>Refund treasury</Button>}</div>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600">{provider && <button className="flex items-center gap-1 text-slate-400 hover:text-cyan-300" title={provider.walletAddress ?? undefined} onClick={() => { if (provider.walletAddress) void navigator.clipboard.writeText(provider.walletAddress); }}>Provider: {provider.name} · {provider.walletAddress ? `${provider.walletAddress.slice(0, 8)}…${provider.walletAddress.slice(-6)}` : "wallet pending"}<Copy className="size-3" /></button>}<span>Deadline {new Date(bounty.deadline).toLocaleString()}</span><span>{bounty.acceptanceCriteria.length} acceptance checks</span>{(bounty.settlementTransactionId ?? bounty.currentTransactionId) && <span>Circle tx {(bounty.settlementTransactionId ?? bounty.currentTransactionId)!.slice(0, 8)}…</span>}</div>
    </div>;
  })}</div></div>;
}
function Transactions({ activities }: { activities: ActivityRecord[] }) {
  const [query, setQuery] = useState("");
  const filtered = activities.filter(activity => `${activity.title} ${activity.note} ${activity.txHash ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="space-y-6"><Header title="Audit trail" note="Every row below is backed by a persisted policy or Arc transaction record." /><div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-600" /><Input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search bounty, Agent, or transaction hash" className="border-white/10 bg-white/[.025] pl-9" /></div><div className="overflow-hidden rounded-2xl border border-white/[.07] bg-[#0c1522]">{filtered.map(activity => <ActivityRow key={activity.id} activity={activity} />)}{!filtered.length && <div className="p-8 text-center text-sm text-slate-500">No matching audit events.</div>}</div></div>;
}
function Header({ title, note, action, onClick, lime }: { title: string; note: string; action?: string; onClick?: () => void; lime?: boolean }) { return <div className="flex items-end justify-between gap-4"><div><h1 className="text-3xl font-semibold tracking-[-.04em]">{title}</h1><p className="mt-2 text-sm text-slate-500">{note}</p></div>{action && <Button className={lime ? "bg-lime-300 text-[#071018] hover:bg-lime-200" : "bg-cyan-300 text-[#071018] hover:bg-cyan-200"} onClick={onClick}><Plus />{action}</Button>}</div>; }
function Mini({ label, value }: { label: string; value: string }) { return <div><div className="text-[11px] uppercase tracking-[.1em] text-slate-600">{label}</div><div className="mt-1.5">{value}</div></div>; }
function formatUsdc(micros: number) { return (micros / 1_000_000).toFixed(2); }
