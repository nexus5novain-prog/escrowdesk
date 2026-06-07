import { useEffect, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";

export function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const path = useRouterState({ select: (s) => s.location.href });

  useEffect(() => {
    if (loading) return;
    if (!user) {
      try {
        if (path && !path.startsWith("/auth")) sessionStorage.setItem("post_auth_redirect", path);
      } catch { /* ignore */ }
      nav({ to: "/auth" });
    }
  }, [user, loading, nav, path]);

  if (loading) return <div className="py-20 text-center text-sm text-muted-foreground">Loading…</div>;
  if (!user) return null;
  return <>{children}</>;
}
