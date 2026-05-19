import { createFileRoute, Link } from "@tanstack/react-router";
import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";

import * as StoreFns from "@/lib/store.functions";

export const Route = createFileRoute("/order-book")({ component: StorePage });

type Product = {
  id: string;
  category: string;
  card_number?: string | null;
  card_user?: string | null;
  card_type?: string | null;
  card_bank?: string | null;
  card_address?: string | null;
  price_usd: number;
};

function blurCardNumber(n: string | undefined | null) {
  if (!n) return "—";
  const s = String(n).replace(/\s+/g, "");
  if (s.length <= 6) return s;
  return s.slice(0, 6) + " •••• ••••";
}

function StorePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("BIN");
  const [isAdmin, setIsAdmin] = useState(false);

  const fetchProducts = useServerFn(StoreFns.listProducts);
  const createProductFn = useServerFn(StoreFns.createProduct);
  const deleteProductFn = useServerFn(StoreFns.deleteProduct);
  const updateProductFn = useServerFn(StoreFns.updateProduct);

  async function load() {
    const res = await fetchProducts({});
    setProducts((res?.products ?? []) as Product[]);
  }

  useEffect(() => {
    load();
    (async () => {
      try {
        const session = await supabase.auth.getSession();
        const uid = session.data.session?.user?.id;
        if (!uid) return;
        const { data } = await supabase.from("user_roles").select("role").eq("user_id", uid);
        setIsAdmin((data ?? []).some((r: any) => r.role === "admin"));
      } catch (e) {
        // ignore
      }
    })();
  }, []);

  const categories = ["BIN", "Enroll", "Scanner", "Exchange"];

  const visible = products.filter((p) => (category ? p.category === category : true) && (!q ? true : String(p.card_number ?? "").includes(q)));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Store</h1>
        <div className="flex gap-2">
          <Link to="/">Back</Link>
          {isAdmin && <Link to="/admin">Admin</Link>}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4">
          <h2 className="text-lg font-medium">Categories</h2>
          <div className="mt-3 flex flex-col gap-2">
            {categories.map((c) => (
              <button key={c} onClick={() => setCategory(c)} className={`text-left ${c === category ? "font-semibold" : "text-muted-foreground"}`}>{c}</button>
            ))}
          </div>
        </Card>

        <Card className="p-4 md:col-span-2">
          <div className="flex items-center gap-3">
            <Input placeholder="Search by BIN or card" value={q} onChange={(e: any) => setQ(e.target.value)} />
            <Button onClick={() => setQ("")}>Clear</Button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {visible.map((p, i) => (
              <Card key={p.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xs text-muted-foreground">Card</div>
                    <div className="font-mono mt-1">{i < 6 ? (p.card_number ?? "—") : blurCardNumber(p.card_number)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Price (USD)</div>
                    <div className="font-semibold">${p.price_usd.toFixed(2)}</div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                  <div>Owner: <span className="text-foreground font-medium">{p.card_user ?? "—"}</span></div>
                  <div>Type: <span className="text-foreground font-medium">{p.card_type ?? "—"}</span></div>
                  <div>Bank: <span className="text-foreground font-medium">{p.card_bank ?? "—"}</span></div>
                  <div>Address: <span className="text-foreground font-medium">{p.card_address ?? "—"}</span></div>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="outline">Buy</Button>
                  {isAdmin && <Button onClick={async () => { await deleteProductFn({ id: p.id }); load(); }}>Delete</Button>}
                </div>
              </Card>
            ))}
            {!visible.length && <div className="text-sm text-muted-foreground">No products found.</div>}
          </div>
        </Card>
      </div>

      {isAdmin && (
        <Card className="p-4">
          <h2 className="text-lg font-medium">Admin — Create product</h2>
          <AdminCreate onCreated={load} />
        </Card>
      )}
      {isAdmin && (
        <Card className="p-4">
          <h2 className="text-lg font-medium">Admin — Inventory</h2>
          <AdminInventory products={products} onUpdated={load} onDeleted={load} onCreated={load} updateFn={updateProductFn} deleteFn={deleteProductFn} />
        </Card>
      )}
    </div>
  );
}

function AdminCreate({ onCreated }: { onCreated: () => void }) {
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ category: "BIN", card_number: "", card_user: "", card_type: "", card_bank: "", card_address: "", price_usd: 0 });

      async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setCreating(true);
    try {
      await createProductFn({ product: form });
      setForm({ category: "BIN", card_number: "", card_user: "", card_type: "", card_bank: "", card_address: "", price_usd: 0 });
      onCreated();
    } finally {
      setCreating(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 grid gap-2 md:grid-cols-3">
      <Input value={form.category} onChange={(e: any) => setForm((s) => ({ ...s, category: e.target.value }))} />
      <Input placeholder="Card number" value={form.card_number} onChange={(e: any) => setForm((s) => ({ ...s, card_number: e.target.value }))} />
      <Input placeholder="Owner" value={form.card_user} onChange={(e: any) => setForm((s) => ({ ...s, card_user: e.target.value }))} />
      <Input placeholder="Type" value={form.card_type} onChange={(e: any) => setForm((s) => ({ ...s, card_type: e.target.value }))} />
      <Input placeholder="Bank" value={form.card_bank} onChange={(e: any) => setForm((s) => ({ ...s, card_bank: e.target.value }))} />
      <Input placeholder="Address" value={form.card_address} onChange={(e: any) => setForm((s) => ({ ...s, card_address: e.target.value }))} />
      <Input placeholder="Price USD" type="number" value={String(form.price_usd)} onChange={(e: any) => setForm((s) => ({ ...s, price_usd: Number(e.target.value) }))} />
      <div className="md:col-span-3 flex justify-end">
        <Button type="submit" disabled={creating}>Create</Button>
      </div>
    </form>
  );
}

function AdminInventory({ products, onUpdated, onDeleted, onCreated, updateFn, deleteFn }: { products: Product[]; onUpdated: () => void; onDeleted: () => void; onCreated: () => void; updateFn: any; deleteFn: any }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<any>(null);

  useEffect(() => { if (!editingId) setForm(null); }, [editingId]);

  async function startEdit(p: Product) {
    setEditingId(p.id);
    setForm({ category: p.category, card_number: p.card_number, card_user: p.card_user, card_type: p.card_type, card_bank: p.card_bank, card_address: p.card_address, price_usd: p.price_usd });
  }

  async function save() {
    if (!editingId) return;
    await updateFn({ id: editingId, patch: form });
    setEditingId(null);
    onUpdated();
  }

  return (
    <div className="mt-3 space-y-2">
      {products.map((p) => (
        <div key={p.id} className="flex items-center justify-between rounded-md border border-border/60 p-3">
          <div className="flex-1">
            <div className="font-mono text-sm">{p.card_number ? (p.card_number.length > 12 ? `${p.card_number.slice(0,6)}••••${p.card_number.slice(-4)}` : p.card_number) : "—"}</div>
            <div className="text-xs text-muted-foreground">{p.card_user ?? "—"} • {p.card_type ?? "—"} • {p.card_bank ?? "—"}</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold">${p.price_usd.toFixed(2)}</div>
            <div>
              {editingId === p.id ? (
                <div className="flex gap-2">
                  <Input value={form?.price_usd ?? ""} type="number" onChange={(e: any) => setForm((s: any) => ({ ...s, price_usd: Number(e.target.value) }))} />
                  <Button onClick={save}>Save</Button>
                  <Button variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button onClick={() => startEdit(p)}>Edit</Button>
                  <Button variant="destructive" onClick={async () => { if (confirm("Delete product?")) { await deleteFn({ id: p.id }); onDeleted(); } }}>Delete</Button>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
      {!products.length && <div className="text-sm text-muted-foreground">No products in inventory.</div>}
    </div>
  );
}
