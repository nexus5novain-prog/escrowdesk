import { motion } from "framer-motion";

/** Animated mediator bot between two parties (buyer ↔ bot ↔ seller). */
export function MediatorBot({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div className="relative mx-auto flex h-40 max-w-md items-center justify-between px-2">
        {/* Left party */}
        <Party label="Buyer" side="left" />

        {/* Packets traveling left -> bot -> right */}
        <Packet from="left" delay={0} />
        <Packet from="right" delay={1.4} />

        {/* Center bot */}
        <motion.div
          initial={{ y: 0 }}
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          className="relative z-10"
        >
          <div className="relative grid h-20 w-20 place-items-center rounded-2xl border border-primary/40 bg-gradient-to-b from-primary/20 to-primary/5 shadow-[0_0_40px_-10px_var(--primary)]">
            <BotFace />
            <motion.div
              className="absolute -inset-2 rounded-2xl border border-primary/30"
              animate={{ opacity: [0.2, 0.7, 0.2], scale: [1, 1.08, 1] }}
              transition={{ duration: 2.2, repeat: Infinity }}
            />
          </div>
          <div className="mt-1 text-center text-[10px] font-mono uppercase tracking-widest text-primary">
            Mediator
          </div>
        </motion.div>

        <Party label="Seller" side="right" />
      </div>
    </div>
  );
}

function Party({ label, side }: { label: string; side: "left" | "right" }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: side === "left" ? -20 : 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.6 }}
      className="flex flex-col items-center gap-1"
    >
      <div className="grid h-14 w-14 place-items-center rounded-full border border-border bg-secondary/50 text-lg">
        {side === "left" ? "👤" : "🧑"}
      </div>
      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</span>
    </motion.div>
  );
}

function Packet({ from, delay }: { from: "left" | "right"; delay: number }) {
  const start = from === "left" ? "12%" : "88%";
  const mid = "50%";
  return (
    <motion.div
      className="absolute top-1/2 z-0 h-2 w-2 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_10px_var(--primary)]"
      initial={{ left: start, opacity: 0 }}
      animate={{ left: [start, mid, start === "12%" ? "88%" : "12%"], opacity: [0, 1, 0] }}
      transition={{ duration: 2.8, repeat: Infinity, delay, ease: "easeInOut" }}
    />
  );
}

function BotFace() {
  return (
    <svg viewBox="0 0 48 48" className="h-10 w-10 text-primary">
      <rect x="10" y="14" width="28" height="22" rx="6" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="19" cy="25" r="2.4" fill="currentColor">
        <animate attributeName="r" values="2.4;0.6;2.4" dur="3s" repeatCount="indefinite" />
      </circle>
      <circle cx="29" cy="25" r="2.4" fill="currentColor">
        <animate attributeName="r" values="2.4;0.6;2.4" dur="3s" repeatCount="indefinite" />
      </circle>
      <rect x="20" y="30" width="8" height="1.6" rx="0.8" fill="currentColor" />
      <line x1="24" y1="9" x2="24" y2="14" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="24" cy="8" r="1.6" fill="currentColor" />
    </svg>
  );
}
