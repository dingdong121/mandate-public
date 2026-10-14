import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const platformUsers = sqliteTable("platform_users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("idx_platform_users_email").on(table.email)]);

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  name: text("name").notNull(),
  purpose: text("purpose").notNull().default(""),
  tagline: text("tagline").notNull().default(""),
  about: text("about").notNull().default(""),
  primaryCategory: text("primary_category").notNull().default("Other"),
  skills: text("skills", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  tools: text("tools", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  workSamples: text("work_samples", { mode: "json" }).$type<Array<{ title: string; url: string; description: string }>>().notNull().default(sql`'[]'`),
  availability: text("availability", { enum: ["available", "busy", "unavailable"] }).notNull().default("available"),
  minimumBountyMicros: integer("minimum_bounty_micros").notNull().default(0),
  typicalDeliveryTime: text("typical_delivery_time").notNull().default(""),
  status: text("status", { enum: ["creating", "active", "paused", "archived"] }).notNull().default("creating"),
  walletProvider: text("wallet_provider").notNull().default("mock"),
  walletId: text("wallet_id"),
  walletAddress: text("wallet_address"),
  walletCreationKey: text("wallet_creation_key"),
  chainId: integer("chain_id").notNull().default(5042002),
  erc8004AgentId: text("erc8004_agent_id"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_agents_owner_created").on(table.ownerId, table.createdAt)]);

export const policies = sqliteTable("policies", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
  dailyLimitMicros: integer("daily_limit_micros").notNull(),
  transactionLimitMicros: integer("transaction_limit_micros").notNull(),
  spentTodayMicros: integer("spent_today_micros").notNull().default(0),
  dayIndex: integer("day_index").notNull(),
  paused: integer("paused", { mode: "boolean" }).notNull().default(false),
  version: integer("version").notNull().default(1),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("idx_policies_agent").on(table.agentId)]);

export const contractDeployments = sqliteTable("contract_deployments", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  kind: text("kind").notNull().default("bounty_escrow"),
  chainId: integer("chain_id").notNull().default(5042002),
  contractVersion: integer("contract_version").notNull().default(1),
  circleContractId: text("circle_contract_id").notNull(),
  transactionId: text("transaction_id").notNull(),
  contractAddress: text("contract_address"),
  txHash: text("tx_hash"),
  status: text("status", { enum: ["pending", "complete", "failed"] }).notNull().default("pending"),
  failureReason: text("failure_reason"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("idx_contract_deployments_owner_kind_chain_version").on(table.ownerId, table.kind, table.chainId, table.contractVersion)]);

// A profile may have independent wallet bindings. Legacy agent wallet columns
// remain intact and are treated only as the explicitly recorded chain's binding.
export const agentWalletBindings = sqliteTable("agent_wallet_bindings", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull().references(() => agents.id),
  ownerId: text("owner_id").notNull(),
  chainId: integer("chain_id").notNull(),
  walletId: text("wallet_id").notNull(),
  walletAddress: text("wallet_address").notNull(),
}, table => [uniqueIndex("idx_agent_wallet_chain").on(table.agentId, table.chainId), uniqueIndex("idx_wallet_network_id").on(table.walletId, table.chainId)]);

export const bountyClientWallets = sqliteTable("bounty_client_wallets", {
  bountyId: text("bounty_id").primaryKey().references(() => bounties.id),
  ownerId: text("owner_id").notNull(),
  chainId: integer("chain_id").notNull(),
  agentId: text("agent_id").notNull().references(() => agents.id),
  walletId: text("wallet_id").notNull(),
  walletAddress: text("wallet_address").notNull(),
});

export const financialOperations = sqliteTable("financial_operations", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  chainId: integer("chain_id").notNull(),
  resource: text("resource").notNull(),
  action: text("action").notNull(),
  requestKey: text("request_key").notNull(),
  payloadHash: text("payload_hash").notNull(),
  circleKey: text("circle_key").notNull(),
  transactionId: text("transaction_id"),
  status: text("status", { enum: ["claimed", "submitted", "uncertain", "complete", "failed"] }).notNull(),
  createdAt: text("created_at").notNull(),
}, table => [
  uniqueIndex("idx_operation_request").on(table.ownerId, table.chainId, table.requestKey),
  uniqueIndex("idx_operation_active_resource").on(table.chainId, table.resource).where(sql`${table.status} IN ('claimed', 'submitted', 'uncertain')`),
]);

// An entire funding session, not just one transaction, owns a signer allowance.
// Otherwise another bounty could overwrite the shared ERC20 allowance between
// a confirmed approval and the owner's next manual Fund action.
export const fundingSessions = sqliteTable("funding_sessions", {
  chainId: integer("chain_id").notNull(),
  walletId: text("wallet_id").notNull(),
  bountyId: text("bounty_id").notNull(),
}, table => [uniqueIndex("idx_funding_signer_network").on(table.chainId, table.walletId)]);

export const allowedRecipients = sqliteTable("allowed_recipients", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
  address: text("address").notNull(),
  serviceName: text("service_name").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
}, (table) => [uniqueIndex("idx_recipient_agent_address").on(table.agentId, table.address)]);

export const bounties = sqliteTable("bounties", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  providerAgentId: text("provider_agent_id").references(() => agents.id),
  title: text("title").notNull(),
  objective: text("objective").notNull(),
  category: text("category").notNull().default("Other"),
  requiredSkills: text("required_skills", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  deliverables: text("deliverables").notNull().default(""),
  acceptanceCriteria: text("acceptance_criteria", { mode: "json" }).$type<string[]>().notNull(),
  rewardMicros: integer("reward_micros").notNull(),
  toolBudgetMicros: integer("tool_budget_micros").notNull().default(0),
  deadline: text("deadline").notNull(),
  status: text("status", { enum: ["draft", "open", "funded", "running", "submitted", "revision_requested", "completed", "rejected", "expired"] }).notNull().default("draft"),
  revisionNote: text("revision_note"),
  resultUrl: text("result_url"),
  deliverySummary: text("delivery_summary"),
  deliveryNotes: text("delivery_notes"),
  chainId: integer("chain_id").notNull().default(5042002),
  contractAddress: text("contract_address"),
  onchainJobId: text("onchain_job_id"),
  fundingStage: text("funding_stage", { enum: ["draft", "create_job_pending", "budget_pending", "approve_pending", "fund_pending", "funded", "failed"] }).notNull().default("draft"),
  currentTransactionId: text("current_transaction_id"),
  currentIdempotencyKey: text("current_idempotency_key"),
  createJobTxHash: text("create_job_tx_hash"),
  setBudgetTxHash: text("set_budget_tx_hash"),
  approveTxHash: text("approve_tx_hash"),
  fundTxHash: text("fund_tx_hash"),
  fundingError: text("funding_error"),
  deliverable: text("deliverable"),
  deliverableHash: text("deliverable_hash"),
  settlementStage: text("settlement_stage", { enum: ["idle", "submit_pending", "complete_pending", "reject_pending", "refund_pending", "settled"] }).notNull().default("idle"),
  settlementTransactionId: text("settlement_transaction_id"),
  settlementIdempotencyKey: text("settlement_idempotency_key"),
  settlementError: text("settlement_error"),
  submitTxHash: text("submit_tx_hash"),
  completeTxHash: text("complete_tx_hash"),
  rejectTxHash: text("reject_tx_hash"),
  refundTxHash: text("refund_tx_hash"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_bounties_owner_status").on(table.ownerId, table.status)]);

export const applications = sqliteTable("applications", {
  id: text("id").primaryKey(),
  bountyId: text("bounty_id").notNull().references(() => bounties.id),
  agentId: text("agent_id").notNull().references(() => agents.id),
  ownerId: text("owner_id").notNull(),
  proposal: text("proposal").notNull(),
  expectedDeliveryTime: text("expected_delivery_time").notNull(),
  proposedAmountMicros: integer("proposed_amount_micros").notNull(),
  workSampleUrl: text("work_sample_url"),
  source: text("source", { enum: ["organic", "invited"] }).notNull().default("organic"),
  status: text("status", { enum: ["applied", "selected", "not_selected", "withdrawn"] }).notNull().default("applied"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [uniqueIndex("idx_applications_bounty_agent").on(table.bountyId, table.agentId), index("idx_applications_owner_created").on(table.ownerId, table.createdAt), index("idx_applications_bounty_status").on(table.bountyId, table.status)]);

export const invitations = sqliteTable("invitations", {
  id: text("id").primaryKey(),
  bountyId: text("bounty_id").notNull().references(() => bounties.id),
  agentId: text("agent_id").notNull().references(() => agents.id),
  publisherId: text("publisher_id").notNull(),
  agentOwnerId: text("agent_owner_id").notNull(),
  publisherName: text("publisher_name").notNull().default("Bounty publisher"),
  note: text("note").notNull().default(""),
  status: text("status", { enum: ["pending", "applied", "dismissed", "expired"] }).notNull().default("pending"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [uniqueIndex("idx_invitations_bounty_agent").on(table.bountyId, table.agentId), index("idx_invitations_agent_owner_status").on(table.agentOwnerId, table.status), index("idx_invitations_publisher_status").on(table.publisherId, table.status)]);

export const bountyEvents = sqliteTable("bounty_events", {
  id: text("id").primaryKey(),
  bountyId: text("bounty_id").notNull().references(() => bounties.id),
  actorId: text("actor_id").notNull(),
  kind: text("kind").notNull(),
  note: text("note").notNull().default(""),
  txHash: text("tx_hash"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [index("idx_bounty_events_bounty_created").on(table.bountyId, table.createdAt)]);

export const ledgerEntries = sqliteTable("ledger_entries", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  agentId: text("agent_id").references(() => agents.id),
  bountyId: text("bounty_id").references(() => bounties.id),
  kind: text("kind").notNull(),
  amountMicros: integer("amount_micros").notNull(),
  recipientAddress: text("recipient_address"),
  purpose: text("purpose").notNull(),
  policyDecision: text("policy_decision", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  status: text("status").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  txHash: text("tx_hash"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_ledger_idempotency").on(table.idempotencyKey),
  index("idx_ledger_owner_created").on(table.ownerId, table.createdAt),
]);
