import { Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { ShieldCheck, ShoppingBag, Menu, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyRoles } from "@/lib/escrow.functions";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function SiteHeader() {
  const { user, signOut } = useAuth();
  const fetchRoles = useServerFn(getMyRoles);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: rolesData } = useQuery({
    queryKey: ["my-roles", user?.id],
    queryFn: () => fetchRoles(),
    enabled: !!user,
    staleTime: 60_000,
  });
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`header-roles-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_roles", filter: `user_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: ["my-roles", user.id] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, qc]);
  const isStaff = (rolesData?.roles ?? []).some((r) => r === "admin" || r === "moderator");

  const linkCls = "px-3 py-2 text-muted-foreground hover:text-foreground rounded-md";
  const activeCls = { className: "px-3 py-2 text-foreground bg-secondary/50 rounded-md" };

  const navLinks = (
    <>
      <Link to="/" className={linkCls} activeProps={activeCls} onClick={() => setOpen(false)}>Home</Link>
      <Link to="/marketplace" className={linkCls} activeProps={activeCls} onClick={() => setOpen(false)}>P2P Trade</Link>
      <Link to="/shop" className={linkCls} activeProps={activeCls} onClick={() => setOpen(false)}>Marketplace</Link>
      {user && (
        <>
          <Link to="/trades" className={`${linkCls} flex items-center gap-1`} activeProps={{ className: `${activeCls.className} flex items-center gap-1` }} onClick={() => setOpen(false)}>
            <ShoppingBag className="h-3.5 w-3.5" /> Trades
          </Link>
          <Link to="/escrow" className={linkCls} activeProps={activeCls} onClick={() => setOpen(false)}>Escrow</Link>
          <Link to="/wallet" className={linkCls} activeProps={activeCls} onClick={() => setOpen(false)}>Wallet</Link>
          <Link to="/settings" className={linkCls} activeProps={activeCls} onClick={() => setOpen(false)}>Settings</Link>
          {isStaff && (
            <Link to="/admin" className={linkCls} activeProps={activeCls} onClick={() => setOpen(false)}>Admin</Link>
          )}
        </>
      )}
    </>
  );

  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-3 sm:px-4">
        <Link to="/" className="flex items-center gap-2 min-w-0">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary/15 text-primary">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <span className="font-semibold tracking-tight truncate">EscrowDesk</span>
          <span className="ml-2 hidden rounded-full border border-border/70 bg-secondary/50 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground lg:inline">
            P2P · Telegram
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden lg:flex items-center gap-1 text-sm">
          {navLinks}
          {user ? (
            <Button size="sm" variant="ghost" onClick={() => signOut()}>Sign out</Button>
          ) : (
            <Link to="/auth"><Button size="sm" variant="default">Sign in</Button></Link>
          )}
        </nav>

        {/* Mobile right side */}
        <div className="flex items-center gap-2 lg:hidden">
          {!user && <Link to="/auth"><Button size="sm">Sign in</Button></Link>}
          <button
            aria-label="Toggle menu"
            onClick={() => setOpen((v) => !v)}
            className="grid h-9 w-9 place-items-center rounded-md border border-border/60 bg-secondary/40 text-foreground"
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="lg:hidden border-t border-border/60 bg-background/95 backdrop-blur-xl">
          <nav className="mx-auto flex max-w-7xl flex-col gap-1 px-3 py-3 text-sm">
            {navLinks}
            {user && (
              <Button size="sm" variant="outline" className="mt-2" onClick={() => { setOpen(false); signOut(); }}>
                Sign out
              </Button>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
