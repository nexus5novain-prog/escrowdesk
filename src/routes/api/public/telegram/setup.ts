import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "crypto";
import { tgCall } from "@/lib/telegram.server";

// Admin-only helper to register the Telegram webhook. Call once from browser.
export const Route = createFileRoute("/api/public/telegram/setup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { url } = await request.json() as { url: string };
        if (!url || !url.startsWith("https://")) return new Response("invalid url", { status: 400 });
        const TK = process.env.TELEGRAM_API_KEY || "";
        const secret = createHash("sha256").update(`telegram-webhook:${TK}`).digest("base64url");
        const r = await tgCall("setWebhook", {
          url, secret_token: secret, allowed_updates: ["message","edited_message","callback_query"],
        });
        return new Response(JSON.stringify(r), { headers: { "Content-Type": "application/json" } });
      },
    },
  },
});
