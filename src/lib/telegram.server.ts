// Telegram gateway helper — server-only.
const GATEWAY = "https://connector-gateway.lovable.dev/telegram";

export async function tgCall(method: string, payload: Record<string, unknown>) {
  const LK = process.env.LOVABLE_API_KEY;
  const TK = process.env.TELEGRAM_API_KEY;
  if (!LK || !TK) {
    console.warn("[telegram] missing API keys; skipping", method);
    return null;
  }
  const res = await fetch(`${GATEWAY}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LK}`,
      "X-Connection-Api-Key": TK,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({} as Record<string, unknown>));
  if (!res.ok) {
    console.error(`[telegram] ${method} ${res.status}`, data);
  }
  return data as { ok?: boolean; result?: unknown; description?: string } | null;
}

export async function tgSendMessage(chat_id: number | string, text: string, extra: Record<string, unknown> = {}) {
  return tgCall("sendMessage", { chat_id, text, parse_mode: "HTML", ...extra });
}

export function tgWebhookSecret() {
  const TK = process.env.TELEGRAM_API_KEY || "";
  // SHA256 in base64url of "telegram-webhook:<TK>"
  // Use Node crypto (workerd nodejs_compat supported)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHash } = require("crypto") as typeof import("crypto");
  return createHash("sha256").update(`telegram-webhook:${TK}`).digest("base64url");
}
