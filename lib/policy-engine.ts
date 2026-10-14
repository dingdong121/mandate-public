export type PaymentIntent = {
  amountMicros: number;
  recipient: string;
  purpose: string;
  idempotencyKey: string;
};

export type SpendingPolicy = {
  paused: boolean;
  dailyLimitMicros: number;
  transactionLimitMicros: number;
  spentTodayMicros: number;
  toolBudgetRemainingMicros?: number;
  allowedRecipients: string[];
};

export type PolicyOutcome = "allowed" | "review_required" | "blocked";

export type PolicyDecision = {
  allowed: boolean;
  outcome: PolicyOutcome;
  checks: Record<string, boolean>;
  reasons: string[];
};

export function evaluatePayment(intent: PaymentIntent, policy: SpendingPolicy): PolicyDecision {
  const recipient = intent.recipient.toLowerCase();
  const checks = {
    positiveAmount: Number.isSafeInteger(intent.amountMicros) && intent.amountMicros > 0,
    agentActive: !policy.paused,
    transactionLimit: intent.amountMicros <= policy.transactionLimitMicros,
    dailyLimit: policy.spentTodayMicros + intent.amountMicros <= policy.dailyLimitMicros,
    taskBudget: policy.toolBudgetRemainingMicros === undefined || intent.amountMicros <= policy.toolBudgetRemainingMicros,
    allowedRecipient: policy.allowedRecipients.map((value) => value.toLowerCase()).includes(recipient),
    hasPurpose: intent.purpose.trim().length >= 8,
    hasIdempotencyKey: intent.idempotencyKey.trim().length >= 8,
  };
  const labels: Record<keyof typeof checks, string> = {
    positiveAmount: "Amount must be a positive integer in USDC microunits.",
    agentActive: "Agent payments are paused.",
    transactionLimit: "Transaction exceeds the per-payment limit.",
    dailyLimit: "Transaction exceeds the remaining daily budget.",
    taskBudget: "Transaction exceeds the remaining bounty tool budget.",
    allowedRecipient: "Recipient is not on the agent allowlist.",
    hasPurpose: "Payment purpose is missing or too short.",
    hasIdempotencyKey: "A valid idempotency key is required.",
  };
  const failed = (Object.keys(checks) as (keyof typeof checks)[]).filter((key) => !checks[key]);
  const reasons = failed.map((key) => labels[key]);
  const onlyRecipientNeedsReview = failed.length === 1 && failed[0] === "allowedRecipient";
  const outcome: PolicyOutcome = failed.length === 0 ? "allowed" : onlyRecipientNeedsReview ? "review_required" : "blocked";
  return { allowed: outcome === "allowed", outcome, checks, reasons };
}
