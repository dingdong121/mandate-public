import {requireUserId,routeError} from '@/lib/auth';
import {recoverOriginalTransaction} from '@/lib/original-transaction-recovery';
import {and,eq} from 'drizzle-orm';
import {getDb} from '@/db';
import {bounties,financialOperations} from '@/db/schema';
import {providerAgent} from '@/lib/escrow-transactions';
import {fail} from '@/lib/arc-safety';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){
 try{
  const owner=requireUserId(request),{id}=await context.params,db=getDb();
  const bounty=(await db.select().from(bounties).where(eq(bounties.id,id)).limit(1))[0];
  if(!bounty)fail('Bounty not found',404);
  const agent=await providerAgent(bounty);
  if(bounty.ownerId!==owner&&agent.ownerId!==owner)fail('Bounty not found',404);
  const ops=await db.select().from(financialOperations).where(and(eq(financialOperations.ownerId,owner),eq(financialOperations.chainId,bounty.chainId),eq(financialOperations.resource,`bounty:${id}`)));
  const locked=ops.filter(o=>['claimed','uncertain'].includes(o.status)&&!o.transactionId);
  const op=locked.length===1?locked[0]:null;
  const authorized=op&&(op.action==='submit_pending'?agent.ownerId===owner:bounty.ownerId===owner);
  const canRecover=Boolean(authorized&&!bounty.currentTransactionId&&!bounty.settlementTransactionId);
  return Response.json({canRecover,action:canRecover?op!.action:null},{headers:{'cache-control':'no-store'}});
 }catch(error){return routeError(error);}
}
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
 try{const owner=requireUserId(request),{id}=await context.params;const body=await request.json() as {transactionId?:string;deliverable?:string};return Response.json(await recoverOriginalTransaction(owner,id,body.transactionId??'',body.deliverable),{headers:{'cache-control':'no-store'}});}
 catch(error){return routeError(error);}
}
