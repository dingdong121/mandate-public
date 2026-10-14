"use client";
import {useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';

async function request(path:string,body?:unknown){
 const response=await fetch(path,{cache:'no-store',...(body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});
 const data=await response.json() as {error?:string;canRecover?:boolean;action?:string|null};if(!response.ok)throw Error(data.error||'Recovery could not be verified. Original lock retained.');return data;
}
export function OriginalTransactionRecovery({bountyId,revision,onRecovered,onAvailability}:{bountyId:string;revision:string;onRecovered:()=>Promise<void>;onAvailability:(blocked:boolean)=>void}){
 const [action,setAction]=useState<string|null>(null),[transactionId,setTransactionId]=useState(''),[deliverable,setDeliverable]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const inFlight=useRef(false);
 useEffect(()=>{let stopped=false;setAction(null);onAvailability(false);
  void request(`/api/bounties/${bountyId}/recover`).then(data=>{if(!stopped){setAction(data.canRecover?data.action??null:null);onAvailability(Boolean(data.canRecover));}}).catch(()=>{ /* Server lock still enforces every write. */ });
  return()=>{stopped=true;};
 },[bountyId,revision,onAvailability]);
 async function recover(){
  if(inFlight.current||!action)return;inFlight.current=true;setBusy(true);setMessage('Checking original transaction. No payment is being sent.');
  try{
   await request(`/api/bounties/${bountyId}/recover`,{transactionId:transactionId.trim(),...(action==='submit_pending'?{deliverable}: {})});
   // Receipt reconciliation only; never execute/send or generate a replacement key.
   const funding=['create_job_pending','budget_pending','approve_pending','fund_pending'].includes(action);
   await request(`/api/bounties/${bountyId}/${funding?'fund':'settle'}`,{action:'reconcile'});
   setAction(null);onAvailability(false);setMessage('Original transaction recovered and receipt verified. No new transaction sent.');await onRecovered();
  }catch(error){setMessage(error instanceof Error?error.message:'Recovery failed. Do not pay again.');}
  finally{inFlight.current=false;setBusy(false);}
 }
 if(!action&&!message)return null;
 return <section className="rounded-2xl border border-amber-300/30 bg-[#0d1724] p-5"><h2 className="text-lg font-medium">Recover original transaction</h2><p className="mt-2 text-sm text-amber-100">The original request is unresolved. Do not pay or submit again. This checks and restores an already completed transaction; it never sends funds.</p>{action&&<div className="mt-4 grid gap-3"><label className="grid gap-2 text-sm">Original Circle Transaction ID<Input value={transactionId} disabled={busy} onChange={e=>setTransactionId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className="border-white/10 bg-white/[.04]" /></label>{action==='submit_pending'&&<label className="grid gap-2 text-sm">Exact original deliverable<Textarea value={deliverable} disabled={busy} onChange={e=>setDeliverable(e.target.value)} maxLength={6000} className="border-white/10 bg-white/[.04]" /></label>}<Button disabled={busy||!transactionId.trim()} onClick={()=>void recover()} className="w-fit bg-cyan-300 text-[#071018]">{busy?'Verifying original receipt…':'Recover & verify original receipt'}</Button></div>}{message&&<p role="status" className="mt-3 text-sm text-slate-300">{message}</p>}</section>;
}
