// send-email — Mailtrap-backed transactional email sender for ABOGIDA.
// Called from the frontend with the user's JWT. Only staff roles may send.
// Secrets (set via dashboard or CLI): MAILTRAP_API_TOKEN, optionally
// MAILTRAP_FROM_EMAIL / MAILTRAP_FROM_NAME to override the demo sender.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const MAILTRAP_URL = "https://send.api.mailtrap.io/api/send";
const ALLOWED_ROLES = ["super_admin", "school_admin", "teacher"];
const MAX_RECIPIENTS = 50;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const token = Deno.env.get("MAILTRAP_API_TOKEN");
  if (!token) {
    return json(500, { error: "MAILTRAP_API_TOKEN secret not configured" });
  }

  // Identify the caller (verify_jwt already rejected invalid tokens).
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return json(401, { error: "Not authenticated" });
  }

  // Staff-only: parents/students must not be able to send arbitrary email.
  const { data: profile } = await supabase
    .from("users")
    .select("role_key")
    .eq("id", user.id)
    .single();
  if (!profile || !ALLOWED_ROLES.includes(profile.role_key)) {
    return json(403, { error: "Not allowed to send email" });
  }

  let payload: {
    to?: unknown;
    subject?: unknown;
    text?: unknown;
    html?: unknown;
    category?: unknown;
  };
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const rawTo = Array.isArray(payload.to) ? payload.to : [payload.to];
  const to = rawTo
    .filter((e): e is string => typeof e === "string" && e.includes("@"))
    .map((email) => ({ email }));
  const subject = typeof payload.subject === "string" ? payload.subject.trim() : "";
  const text = typeof payload.text === "string" ? payload.text : undefined;
  const html = typeof payload.html === "string" ? payload.html : undefined;

  if (to.length === 0) return json(400, { error: "No valid recipients" });
  if (to.length > MAX_RECIPIENTS) {
    return json(400, { error: `Too many recipients (max ${MAX_RECIPIENTS})` });
  }
  if (!subject) return json(400, { error: "Subject is required" });
  if (!text && !html) return json(400, { error: "text or html body is required" });

  const res = await fetch(MAILTRAP_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: {
        email: Deno.env.get("MAILTRAP_FROM_EMAIL") ?? "hello@demomailtrap.co",
        name: Deno.env.get("MAILTRAP_FROM_NAME") ?? "ABOGIDA",
      },
      to,
      subject,
      ...(text ? { text } : {}),
      ...(html ? { html } : {}),
      category: typeof payload.category === "string" ? payload.category : "app",
    }),
  });

  const result = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("Mailtrap error", res.status, result);
    return json(502, { error: "Email provider rejected the send", detail: result });
  }
  return json(200, { success: true, message_ids: result.message_ids ?? [] });
});
