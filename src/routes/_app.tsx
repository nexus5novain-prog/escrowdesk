import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app")({ component: AppLayout });

function AppLayout() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  useEffect(() => { if (!loading && !user) nav({ to: "/auth" }); }, [user, loading, nav]);
  if (loading) return <div className="py-20 text-center text-sm text-muted-foreground">Loading…</div>;
  if (!user) return null;
  return <Outlet />;
}
