"use client";
import { useState } from "react";
export function TestnetSetup() {
  const [result, setResult] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [bountyId, setBountyId] = useState("");
  async function recoverOriginal() {
    if (!/^[a-f0-9-]{36}$/i.test(bountyId)) { setResult({ error: "Enter the original bounty ID." }); return; }
    if (!window.confirm("Recover the original Testnet create-job request using its SAME Circle idempotency key and verified transaction parameters, correcting only the rejected reference metadata? This may execute the original request if it was never accepted. No new key is generated. A provider conflict stays locked. Testnet gas may be spent.")) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/bounties/${bountyId}/fund`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "recover_original" }) });
      setResult({ step: "recover_original", result: await response.json() });
    } catch { setResult({ error: "Recovery outcome unavailable. Do not click again; query the original transaction." }); }
    finally { setBusy(false); }
  }
  async function run(action: "preflight" | "deploy_v2" | "reconcile") {
    if (action === "deploy_v2" && !window.confirm("Deploy the reviewed V2 on Arc Testnet once? This spends TEST USDC gas, not bounty funds. Do not continue if Circle indicates a real monetary charge.")) return;
    setBusy(true);
    try {
      const response = await fetch(action === "preflight" ? "/api/contracts/escrow?preflight=1" : "/api/contracts/escrow", action === "preflight" ? { cache: "no-store" } : { method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ action }) });
      const body = await response.json();
      setResult({ step: action, result: body });
      if (action === "preflight") setReady(response.ok);
      if (action === "deploy_v2") setReady(false);
    } catch { setResult({ error: "Request outcome unavailable. Do not resend a deployment; check its original transaction." }); setReady(false); }
    finally { setBusy(false); }
  }
  return <main style={{ maxWidth: 820, margin: "40px auto", padding: 24 }}>
    <h1>Mandate · Arc Testnet escrow setup</h1>
    <p>Beta · Arc Testnet · Do not send mainnet assets.</p>
    <p>Only the existing treasury operator may deploy. No bounty is funded here. Mainnet is disabled.</p>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, margin: "24px 0" }}>
      <button style={{ padding: "10px 14px", border: "1px solid #64748b", borderRadius: 8, opacity: busy ? .4 : 1 }} disabled={busy} onClick={() => void run("preflight")}>1. Check Testnet signer & fee</button>
      <button style={{ padding: "10px 14px", border: "1px solid #64748b", borderRadius: 8, opacity: busy || !ready ? .35 : 1 }} disabled={busy || !ready} onClick={() => void run("deploy_v2")}>2. Deploy V2 once</button>
      <button style={{ padding: "10px 14px", border: "1px solid #64748b", borderRadius: 8, opacity: busy ? .4 : 1 }} disabled={busy} onClick={() => void run("reconcile")}>3. Verify deployment receipt</button>
    </div>
    <p>Pending or uncertain: verify the original receipt; never redeploy to discover its outcome.</p>
    {!ready && <p>Deployment is disabled until step 1 succeeds on this page. A receipt can only be verified after a deployment has been submitted.</p>}
    <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(result, null, 2)}</pre>
    <section style={{ margin: "24px 0", border: "1px solid #64748b", padding: 16 }}>
      <h2>Recover original Testnet request</h2>
      <p>Only an uncertain create-job request can be recovered. Original key and payload hash must match. No lock is deleted.</p>
      <label>Original bounty ID <input value={bountyId} onChange={event => setBountyId(event.target.value.trim())} style={{ width: "100%", margin: "12px 0", background: "#17212b", padding: 10 }} /></label>
      <button disabled={busy} onClick={() => void recoverOriginal()} style={{ border: "1px solid #64748b", padding: 10 }}>Recover original request · same key</button>
    </section>
    <a href="/">Back to Mandate</a>
  </main>;
}
