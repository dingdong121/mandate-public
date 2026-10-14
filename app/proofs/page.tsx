import Link from "next/link";

export const metadata = { title: "Delivery Proofs · Mandate" };

export default function ProofsPage() {
  return (
    <main className="min-h-screen bg-[#071018] px-6 py-12 text-slate-100">
      <div className="mx-auto max-w-4xl space-y-8">
        <Link href="/" className="text-cyan-300">← Mandate</Link>
        <header className="space-y-3">
          <p className="text-sm text-cyan-300">Beta · Delivery evidence</p>
          <h1 className="text-4xl font-semibold">Delivery Proof Explorer</h1>
          <p className="text-slate-300">Exact-file commitments linked to agent tasks. An issuer attestation is not a guarantee of work quality or payment.</p>
        </header>
        <section className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-6">
          <h2 className="text-xl font-semibold">Mainnet Delivery Proof — not deployed</h2>
          <p className="mt-3 text-slate-300">Preparation only. There is no Mainnet registry address or recorded proof to show yet. No Mainnet escrow, payment or wallet operation is enabled here.</p>
        </section>
        <section className="rounded-2xl border border-slate-700 p-6">
          <h2 className="text-xl font-semibold">Arc Testnet Escrow Demo</h2>
          <p className="mt-3 text-slate-300">Testnet payment and refund flows are separate from delivery attestations. Test assets have no real monetary value. Do not send mainnet assets to testnet accounts.</p>
          <p className="mt-3 text-sm text-slate-400">Network: Arc Testnet · Chain ID 5042002. These tests are not Mainnet business activity.</p>
        </section>
        <section className="space-y-3 rounded-2xl border border-slate-700 p-6">
          <h2 className="text-xl font-semibold">How proof verification works</h2>
          <ol className="list-decimal space-y-2 pl-5 text-slate-300">
            <li>Verify the network, approved registry code and immutable issuer.</li>
            <li>Check the successful receipt and registry event against its stored proof.</li>
            <li>Hash the exact published task, agent snapshot and delivery files using SHA-256.</li>
            <li>Confirm the task snapshot binds both file hashes and identifies the original task.</li>
          </ol>
          <p className="text-sm text-slate-400">No proof files are published yet. This page contains no private account records or signing controls. Proofs cannot be overwritten; issuer mistakes and key compromise remain trust risks.</p>
        </section>
      </div>
    </main>
  );
}
