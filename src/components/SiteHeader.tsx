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
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-3 py-2 sm:h-14 sm:flex-nowrap sm:px-4 sm:py-0">
        <Link to="/" className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-primary/15 text-primary">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <span className="font-semibold tracking-tight">EscrowDesk</span>
          <span className="ml-2 hidden rounded-full border border-border/70 bg-secondary/50 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground sm:inline">
            P2P · Telegram
          </span>
        </Link>
        <nav className="-mx-1 flex w-full items-center gap-0.5 overflow-x-auto whitespace-nowrap text-sm sm:w-auto sm:gap-1 sm:overflow-visible">
          <Link to="/" className="px-2 py-2 text-muted-foreground hover:text-foreground sm:px-3" activeProps={{ className: "px-2 py-2 text-foreground sm:px-3" }}>Home</Link>
          <Link to="/marketplace" className="px-2 py-2 text-muted-foreground hover:text-foreground sm:px-3" activeProps={{ className: "px-2 py-2 text-foreground sm:px-3" }}>Marketplace</Link>
          <Link to="/order-book" className="px-2 py-2 text-muted-foreground hover:text-foreground sm:px-3" activeProps={{ className: "px-2 py-2 text-foreground sm:px-3" }}>Order book</Link>
          {user && (
            <>
              <Link to="/trades" className="px-2 py-2 text-muted-foreground hover:text-foreground sm:px-3" activeProps={{ className: "px-2 py-2 text-foreground sm:px-3" }}>Trades</Link>
              <Link to="/escrow/new" className="px-2 py-2 text-muted-foreground hover:text-foreground sm:px-3" activeProps={{ className: "px-2 py-2 text-foreground sm:px-3" }}>Escrow</Link>
              <Link to="/wallet" className="px-2 py-2 text-muted-foreground hover:text-foreground sm:px-3" activeProps={{ className: "px-2 py-2 text-foreground sm:px-3" }}>Wallet</Link>
              <Link to="/settings" className="px-2 py-2 text-muted-foreground hover:text-foreground sm:px-3" activeProps={{ className: "px-2 py-2 text-foreground sm:px-3" }}>Settings</Link>
              {isStaff && (
                <Link to="/admin" className="px-2 py-2 text-muted-foreground hover:text-foreground sm:px-3" activeProps={{ className: "px-2 py-2 text-foreground sm:px-3" }}>Admin</Link>
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
