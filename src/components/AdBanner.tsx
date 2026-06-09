import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listAdsForPlacement, type AdPlacement } from "@/lib/ads.functions";
import { supabase } from "@/integrations/supabase/client";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

type Ad = {
  id: string;
  title: string;
  media_type: "image" | "video" | "html";
  media_url: string | null;
  html_content: string | null;
  link_url: string | null;
  placements: string[];
  priority: number;
};

interface Props {
  placement: AdPlacement;
  className?: string;
  dismissable?: boolean;
  rotateMs?: number;
  variant?: "banner" | "card" | "sidebar";
}

export function AdBanner({ placement, className = "", dismissable = false, rotateMs = 12000, variant = "banner" }: Props) {
  const fn = useServerFn(listAdsForPlacement);
  const [dismissed, setDismissed] = useState(false);
  const [idx, setIdx] = useState(0);

  const { data, refetch } = useQuery({
    queryKey: ["ads", placement],
    queryFn: () => fn({ data: { placement } }),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  useEffect(() => {
    const ch = supabase
      .channel(`ads-${placement}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ad_banners" }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [placement, refetch]);

  const ads = useMemo<Ad[]>(() => (data?.ads ?? []) as Ad[], [data]);

  useEffect(() => {
    if (ads.length < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % ads.length), rotateMs);
    return () => clearInterval(t);
  }, [ads.length, rotateMs]);

  if (dismissed || ads.length === 0) return null;
  const ad = ads[idx % ads.length];

  const sizeBase =
    variant === "sidebar" ? "rounded-lg" :
    variant === "card" ? "rounded-lg" : "rounded-md";

  const body = (
    <div className={`relative overflow-hidden border border-border/60 bg-secondary/20 ${sizeBase}`}>
      {ad.media_type === "image" && ad.media_url && (
        <img src={ad.media_url} alt={ad.title} className="block w-full object-cover" loading="lazy" />
      )}
      {ad.media_type === "video" && ad.media_url && (
        <video src={ad.media_url} className="block w-full" autoPlay muted loop playsInline />
      )}
      {ad.media_type === "html" && ad.html_content && (
        <div className="ad-html prose-sm max-w-none p-3 text-sm [&_a]:text-primary [&_img]:max-w-full" dangerouslySetInnerHTML={{ __html: ad.html_content }} />
      )}
      {variant !== "card" && ad.title && (
        <div className="pointer-events-none absolute left-2 top-2 rounded bg-background/70 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground backdrop-blur">
          Ad · {ad.title}
        </div>
      )}
      {dismissable && (
        <Button
          size="icon" variant="ghost"
          aria-label="Dismiss"
          className="absolute right-1 top-1 h-6 w-6 bg-background/60 hover:bg-background"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDismissed(true); }}
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  );

  const wrapperCls = `block ${className}`;
  if (ad.link_url) {
    return (
      <a href={ad.link_url} target="_blank" rel="noreferrer sponsored" className={wrapperCls}>
        {body}
      </a>
    );
  }
  return <div className={wrapperCls}>{body}</div>;
}
