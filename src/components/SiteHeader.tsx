import { Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { ShieldCheck } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyRoles } from "@/lib/escrow.functions";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export function SiteHeader() {
  const { user, signOut } = useAuth();
  const fetchRoles = useServerFn(getMyRoles);
  const qc = useQueryClient();
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
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-primary/15 text-primary">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <span className="font-semibold tracking-tight">EscrowDesk</span>
          <span className="ml-2 hidden rounded-full border border-border/70 bg-secondary/50 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground sm:inline">
            P2P · Telegram
          </span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link to="/" className="px-3 py-2 text-muted-foreground hover:text-foreground" activeProps={{ className: "px-3 py-2 text-foreground" }}>Home</Link>
          <Link to="/marketplace" className="px-3 py-2 text-muted-foreground hover:text-foreground" activeProps={{ className: "px-3 py-2 text-foreground" }}>Marketplace</Link>
          <Link to="/shop" className="px-3 py-2 text-muted-foreground hover:text-foreground" activeProps={{ className: "px-3 py-2 text-foreground" }}>Shop</Link>
          {user && (
            <>
              <Link to="/escrow" className="px-3 py-2 text-muted-foreground hover:text-foreground" activeProps={{ className: "px-3 py-2 text-foreground" }}>Escrow</Link>
              <Link to="/wallet" className="px-3 py-2 text-muted-foreground hover:text-foreground" activeProps={{ className: "px-3 py-2 text-foreground" }}>Wallet</Link>
              <Link to="/wallet" className="px-3 py-2 text-muted-foreground hover:text-foreground" activeProps={{ className: "px-3 py-2 text-foreground" }}>Wallet</Link>
              <Link to="/settings" className="px-3 py-2 text-muted-foreground hover:text-foreground" activeProps={{ className: "px-3 py-2 text-foreground" }}>Settings</Link>
              {isStaff && (
                <Link to="/admin" className="px-3 py-2 text-muted-foreground hover:text-foreground" activeProps={{ className: "px-3 py-2 text-foreground" }}>Admin</Link>
              )}
            </>
          )}
          {user ? (
            <Button size="sm" variant="ghost" onClick={() => signOut()}>Sign out</Button>
          ) : (
            <Link to="/auth"><Button size="sm" variant="default">Sign in</Button></Link>
          )}
        </nav>
      </div>
    </header>
  );
}
