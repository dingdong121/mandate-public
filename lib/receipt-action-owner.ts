type ReceiptBounty = { isMine: boolean; isParticipant: boolean; providerAgentId?: string | null; currentTransactionId?: string | null; settlementTransactionId?: string | null; settlementStage?: string };

// Match server reconciliation ownership: publisher funds/settles, selected Agent submits.
export function canCheckReceipt(bounty: ReceiptBounty, ownedAgentIds: ReadonlySet<string>): boolean {
  if (!bounty.isParticipant) return false;
  if (bounty.settlementTransactionId) {
    return bounty.settlementStage === "submit_pending"
      ? Boolean(bounty.providerAgentId && ownedAgentIds.has(bounty.providerAgentId))
      : bounty.isMine;
  }
  return Boolean(bounty.currentTransactionId && bounty.isMine);
}
