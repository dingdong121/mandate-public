import {env} from 'cloudflare:workers';
import {and,eq} from 'drizzle-orm';
import {Interface} from 'ethers';
import {getDb} from '@/db';
import {bounties,financialOperations,contractDeployments} from '@/db/schema';
import {assertPaymentNetwork,fail,rpc,validateReceipt,verifyRpc,USDC,type Receipt} from './arc-safety';
import {circleClient,paymentRpc,providerAgent,validateSigner} from './escrow-transactions';
import {clientWallet} from './client-wallet';
import {paymentNetwork} from './payment-network';

const signatures:Record<string,string>={create_job_pending:'createJob(address,address,uint256,string,address)',budget_pending:'setBudget(uint256,uint256,bytes)',approve_pending:'approve(address,uint256)',fund_pending:'fund(uint256,bytes)',submit_pending:'submit(uint256,bytes32,bytes)',complete_pending:'complete(uint256,bytes32,bytes)',reject_pending:'reject(uint256,bytes32,bytes)',refund_pending:'refund(uint256)'};
async function hash(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');}

// Attaches ONLY a successfully mined ORIGINAL transaction. No create/send SDK
// endpoint, no replacement idempotency key, no TTL unlock and no resend.
export async function recoverOriginalTransaction(owner:string,bountyId:string,transactionId:string,deliverable?:string){
 if(!transactionId||transactionId.length>100)fail('Original Circle transaction ID required',400);
 const db=getDb();const bounty=(await db.select().from(bounties).where(eq(bounties.id,bountyId)).limit(1))[0];if(!bounty)fail('Bounty not found',404);
 assertPaymentNetwork(bounty.chainId);
 // Pick the locked operation, not an arbitrary historic operation.
 const operations=await db.select().from(financialOperations).where(and(eq(financialOperations.ownerId,owner),eq(financialOperations.chainId,bounty.chainId),eq(financialOperations.resource,`bounty:${bountyId}`)));
 const locked=operations.filter(o=>['claimed','uncertain'].includes(o.status)&&!o.transactionId);
 if(locked.length!==1)fail('Exactly one unresolved original operation is required');
 const op=locked[0],signature=signatures[op.action];if(!signature)fail('Unsupported original operation');
 const agent=await providerAgent(bounty);if(op.action==='submit_pending'?agent.ownerId!==owner:bounty.ownerId!==owner)fail('Only original action owner can recover',403);
 if(bounty.currentTransactionId||bounty.settlementTransactionId)fail('An attached transaction already exists; reconcile it');
 const payer=op.action==='submit_pending'?null:await clientWallet(bounty);
 const walletId=op.action==='submit_pending'?agent.walletId!:payer!.walletId;
 const signer=op.action==='submit_pending'?agent.walletAddress!:payer!.address;
 const tx=(await circleClient(bounty.chainId).getTransaction({id:transactionId})).data?.transaction;
 if(!tx||tx.id!==transactionId||tx.walletId!==walletId||tx.blockchain!==paymentNetwork(bounty.chainId).blockchain||tx.refId!==op.id||tx.state!=='COMPLETE'||!tx.txHash)fail('Original Circle transaction metadata not proven; lock retained');
 const endpoint=paymentRpc(bounty.chainId);await verifyRpc(endpoint,bounty.chainId);
 const chainTx=await rpc<{hash:string;from:string;to:string;input:string;value:string;chainId:string}|null>(endpoint,'eth_getTransactionByHash',[tx.txHash]);
 if(!chainTx||chainTx.hash.toLowerCase()!==tx.txHash.toLowerCase()||chainTx.from.toLowerCase()!==signer.toLowerCase()||Number(BigInt(chainTx.chainId))!==bounty.chainId||BigInt(chainTx.value)!==0n)fail('Original chain transaction mismatch');
 let target=bounty.contractAddress;
 if(op.action==='create_job_pending'){
  const deployment=(await db.select().from(contractDeployments).where(and(eq(contractDeployments.chainId,bounty.chainId),eq(contractDeployments.contractAddress,chainTx.to),eq(contractDeployments.status,'complete'),eq(contractDeployments.contractVersion,2))).limit(1))[0];
  if(!deployment?.contractAddress)fail('Original deployment binding unavailable');target=deployment.contractAddress;
 }
 if(!target)fail('Original contract binding unavailable');
 const executionTarget=op.action==='approve_pending'?USDC:target;
 if(chainTx.to.toLowerCase()!==executionTarget.toLowerCase())fail('Original execution target mismatch');
 await validateSigner({...bounty,contractAddress:target},walletId,signer);
 validateReceipt(await rpc<Receipt|null>(endpoint,'eth_getTransactionReceipt',[tx.txHash]),tx.txHash,executionTarget,signer);
 const abi=new Interface([`function ${signature}`]);const parsed=abi.parseTransaction({data:chainTx.input});if(!parsed)fail('Original ABI payload unavailable');
 // Canonical addresses must preserve the originally submitted spelling: use
 // trusted bound addresses, not decoder-generated checksum capitalization.
 const parameters=parsed.args.map(v=>String(v));
 if(op.action==='create_job_pending'){parameters[0]=agent.walletAddress!;parameters[1]=signer;parameters[4]='0x0000000000000000000000000000000000000000';}
 if(op.action==='approve_pending')parameters[0]=target;
 const expected=await hash(JSON.stringify({resource:op.resource,action:op.action,payload:{walletId,target:executionTarget,signature,parameters}}));
 if(expected!==op.payloadHash)fail('Original business payload hash mismatch; lock retained');
 let deliveryHash:string|null=null;
 if(op.action==='submit_pending'){
  const work=deliverable?.trim();if(!work||work.length<3||work.length>6000)fail('Restore the exact original deliverable to recover submission',400);
  deliveryHash=`0x${await hash(work)}`;if(deliveryHash.toLowerCase()!==parameters[1].toLowerCase())fail('Original deliverable hash mismatch');
 }
 const funding=['create_job_pending','budget_pending','approve_pending','fund_pending'].includes(op.action);
 const now=new Date().toISOString();
 const results=await env.DB!.batch([
  env.DB!.prepare("UPDATE financial_operations SET transaction_id=?,status='submitted' WHERE id=? AND owner_id=? AND status IN ('claimed','uncertain') AND transaction_id IS NULL AND EXISTS (SELECT 1 FROM bounties WHERE id=? AND updated_at=? AND current_transaction_id IS NULL AND settlement_transaction_id IS NULL)").bind(transactionId,op.id,owner,bountyId,bounty.updatedAt),
  env.DB!.prepare(`UPDATE bounties SET ${funding?'funding_stage=?,current_transaction_id=?,current_idempotency_key=?':'settlement_stage=?,settlement_transaction_id=?,settlement_idempotency_key=?'},contract_address=?,deliverable=coalesce(?,deliverable),deliverable_hash=coalesce(?,deliverable_hash),updated_at=? WHERE id=? AND updated_at=? AND EXISTS (SELECT 1 FROM financial_operations WHERE id=? AND transaction_id=? AND status='submitted')`).bind(op.action,transactionId,op.circleKey,target,deliveryHash?deliverable!.trim():null,deliveryHash,now,bountyId,bounty.updatedAt,op.id,transactionId),
 ]);
 if(results.some(r=>r.meta.changes!==1))fail('Recovery state changed; original lock retained or receipt reconciliation required');
 return {status:'attached_original',transactionId,txHash:tx.txHash,transactionSent:false,reusedOriginalKey:true};
}
