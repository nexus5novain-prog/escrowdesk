import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { AuthGate } from "@/components/AuthGate";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useServerFn } from "@tanstack/react-start";
import { createListing } from "@/lib/marketplace.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ShoppingBag, Search, ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/post-listing")({
  component: () => (<AuthGate><Page /></AuthGate>),
});

type Kind = "selling" | "seeking";

function Page() {
  const nav = useNavigate();
  const fn = useServerFn(createListing);
  const [step, setStep] = useState<1 | 2>(1);
  const [kind, setKind] = useState<Kind | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [f, setF] = useState({
    name: "", description: "", category: "", amount: "", currency: "USD",
    contact_telegram: "", contact_website: "",
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kind) return;
    setSubmitting(true);
    try {
      await fn({ data: {
        kind,
        name: f.name,
        description: f.description,
        category: f.category,
        amount: kind === "selling" && f.amount ? Number(f.amount) : null,
        currency: f.currency || "USD",
        contact_telegram: f.contact_telegram || undefined,
        contact_website: f.contact_website || undefined,
      }});
      toast.success("Listing published");
      nav({ to: "/" });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">← Back to marketplace</Link>
        <Badge variant="outline" className="font-mono text-[10px]">Step {step} of 2</Badge>
      </div>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div key="step1" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.25 }} className="surface space-y-4 p-6">
            <h1 className="text-xl font-semibold">What are you posting?</h1>
            <p className="text-sm text-muted-foreground">Pick one to continue.</p>
            <div className="grid gap-3 md:grid-cols-2">
              <KindCard active={kind === "selling"} onClick={() => setKind("selling")} icon={<ShoppingBag className="h-5 w-5" />} title="I'm selling" desc="Offer a product or asset for sale." />
              <KindCard active={kind === "seeking"} onClick={() => setKind("seeking")} icon={<Search className="h-5 w-5" />} title="I'm seeking" desc="Looking for a product or service." />
            </div>
            <div className="flex justify-end">
              <Button onClick={() => kind && setStep(2)} disabled={!kind} className="gap-2">Continue <ArrowRight className="h-4 w-4" /></Button>
            </div>
          </motion.div>
        )}

        {step === 2 && kind && (
          <motion.form key="step2" onSubmit={submit} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.25 }} className="surface space-y-4 p-6">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-semibold">{kind === "selling" ? "Selling details" : "Seeking details"}</h1>
              <Badge variant="secondary" className="font-mono text-[10px]">{kind.toUpperCase()}</Badge>
            </div>

            <div className="grid gap-3">
              <Field label={kind === "selling" ? "Product name" : "Service name"}>
                <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={kind === "selling" ? "e.g. iPhone 15 Pro 256GB" : "e.g. Logo designer for fintech startup"} required maxLength={120} />
              </Field>
              <Field label="Description">
                <Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder={kind === "selling" ? "Condition, specs, why you're selling…" : "Scope, deadline, budget hints, must-haves…"} required maxLength={2000} rows={4} />
              </Field>
              <Field label="Category">
                <Input value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="e.g. Electronics, Design, Crypto, Real Estate" required maxLength={60} />
              </Field>

              {kind === "selling" && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2"><Field label="Amount"><Input type="number" min="0" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="e.g. 950.00" /></Field></div>
                  <Field label="Currency"><Input value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value.toUpperCase() })} placeholder="USD" maxLength={8} /></Field>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field label="Telegram contact (optional)"><Input value={f.contact_telegram} onChange={(e) => setF({ ...f, contact_telegram: e.target.value })} placeholder="@yourhandle" maxLength={60} /></Field>
                <Field label="Website / link (optional)"><Input value={f.contact_website} onChange={(e) => setF({ ...f, contact_website: e.target.value })} placeholder="https://…" maxLength={200} /></Field>
              </div>
            </div>

            <div className="flex justify-between">
              <Button type="button" variant="ghost" onClick={() => setStep(1)} className="gap-2"><ArrowLeft className="h-4 w-4" /> Back</Button>
              <Button type="submit" disabled={submitting} className="gap-2">
                <CheckCircle2 className="h-4 w-4" /> {submitting ? "Publishing…" : "Publish listing"}
              </Button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}

function KindCard({ active, onClick, icon, title, desc }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <motion.button type="button" onClick={onClick} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
      className={`text-left rounded-lg border p-4 transition-colors ${active ? "border-primary bg-primary/10" : "border-border bg-secondary/20 hover:bg-secondary/40"}`}>
      <div className="mb-2 grid h-9 w-9 place-items-center rounded-md bg-primary/15 text-primary">{icon}</div>
      <div className="font-semibold">{title}</div>
      <div className="text-xs text-muted-foreground">{desc}</div>
    </motion.button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>{children}</div>;
}
