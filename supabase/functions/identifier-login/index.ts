import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status: number, extraHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extraHeaders },
  });

// ============================================================
// TRUSTED CLIENT IP EXTRACTION & HARDENING
// ============================================================
function isValidIp(ip: string): boolean {
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  const ipv6Regex = /^[0-9a-fA-F:]{2,39}$/;
  return ipv4Regex.test(ip) || ipv6Regex.test(ip);
}

function isPrivateIp(ip: string): boolean {
  return /^(?:10\.|127\.|172\.(?:1[6-9]|2[0-9]|3[01])\.|192\.168\.|fc00:|fe80:|::1)/i.test(ip);
}

/**
 * Extracts a candidate client IP without falling back to shared addresses.
 * If no trustworthy public IP candidate can be determined, returns null.
 * Callers MUST NOT collapse unknown clients into a single shared bucket (e.g. 127.0.0.1).
 */
function extractCandidateClientIp(req: Request): string | null {
  // 1. Authoritative Cloudflare connecting IP (set at Edge proxy)
  const cfIp = req.headers.get("cf-connecting-ip")?.trim();
  if (cfIp && isValidIp(cfIp) && !isPrivateIp(cfIp)) {
    return cfIp;
  }

  // 2. Forwarded header from trusted reverse proxies:
  // Edge proxies append to the right; inspect from right to left for a valid public IP.
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((p) => p.trim()).filter(Boolean);
    for (let i = parts.length - 1; i >= 0; i--) {
      const candidate = parts[i];
      if (isValidIp(candidate) && !isPrivateIp(candidate)) {
        return candidate;
      }
    }
  }

  // 3. Fallback to x-real-ip if valid public IP
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp && isValidIp(realIp) && !isPrivateIp(realIp)) {
    return realIp;
  }

  // No trustworthy client IP could be established.
  // Explicitly return null instead of a shared fallback bucket to prevent collective DoS.
  return null;
}

// ============================================================
// DOMAIN-SEPARATED HMAC-SHA-256 IDENTIFIER DERIVATION (SEC-05-01)
// ============================================================
const HMAC_DOMAIN_PREFIX = "aiet:auth:identifier:v1:";

/**
 * Derives a domain-separated HMAC-SHA-256 digest for an identifier.
 * Fails safely if the secret key is missing or insufficient.
 */
async function deriveIdentifierHMAC(rawIdentifier: string, secretKey: string): Promise<string> {
  const normalized = rawIdentifier.trim().toUpperCase();
  const domainSeparatedMessage = `${HMAC_DOMAIN_PREFIX}${normalized}`;
  const encoder = new TextEncoder();

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secretKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(domainSeparatedMessage));
  return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const body = await req.json().catch(() => null);
    const identifier = body?.identifier;
    const password = body?.password;

    // 1. Strict Input Format Validation
    if (
      typeof identifier !== "string" ||
      !/^[A-Za-z0-9._-]{2,64}$/.test(identifier.trim()) ||
      typeof password !== "string" ||
      password.length === 0 || password.length > 256
    ) {
      return json({ error: "Invalid credentials." }, 401);
    }

    // 2. Environment & Cryptographic Secret Verification (Strict Key Separation)
    // @ts-ignore Deno global
    const url = Deno.env.get("SUPABASE_URL");
    // @ts-ignore Deno global
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    // @ts-ignore Deno global
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    // @ts-ignore Deno global
    const hmacSecret = Deno.env.get("RATE_LIMIT_HMAC_SECRET")?.trim();

    if (!url || !anonKey || !serviceRoleKey) {
      console.error("[IdentifierLogin] Backend Supabase environment variables are missing.");
      return json({ error: "Authentication service is unavailable." }, 503);
    }

    // Require dedicated RATE_LIMIT_HMAC_SECRET: must be valid 32-byte hex (64 hex characters)
    // Zero fallback to SUPABASE_SERVICE_ROLE_KEY (strict cryptographic key separation)
    if (!hmacSecret || !/^[0-9a-fA-F]{64}$/.test(hmacSecret)) {
      console.error("[IdentifierLogin] Dedicated RATE_LIMIT_HMAC_SECRET is missing or invalid (expected 64-character hex string).");
      return json({ error: "Authentication service is temporarily unavailable." }, 503);
    }

    const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

    // 3. Client IP Request Rate Limiting (max 15 requests / 60 seconds)
    // Only applied when a valid, non-private client IP can be established
    const clientIp = extractCandidateClientIp(req);
    if (clientIp) {
      const { data: ipRateLimit, error: ipRpcError } = await admin.rpc(
        "check_and_increment_ip_rate_limit",
        { p_client_ip: clientIp }
      );

      if (ipRpcError) {
        console.error("[IdentifierLogin] IP rate limit check error:", ipRpcError.message);
      } else if (ipRateLimit && ipRateLimit.allowed === false) {
        const retryAfter = ipRateLimit.retry_after || 60;
        return json(
          { error: "Too many login requests from your network. Please try again later." },
          429,
          { "Retry-After": String(retryAfter) }
        );
      }
    }

    // 4. Primary Cryptographic HMAC Identifier Rate Limit Pre-Check (max 5 failed attempts / 15 mins)
    const identifierHash = await deriveIdentifierHMAC(identifier, hmacSecret);

    const { data: idRateLimit, error: idRpcError } = await admin.rpc(
      "check_identifier_rate_limit",
      { p_identifier_hash: identifierHash }
    );

    if (idRpcError) {
      console.error("[IdentifierLogin] Identifier rate limit check error:", idRpcError.message);
    } else if (idRateLimit && idRateLimit.allowed === false) {
      const retryAfter = idRateLimit.retry_after || 900;
      return json(
        { error: "Too many failed login attempts for this identifier. Please try again later." },
        429,
        { "Retry-After": String(retryAfter) }
      );
    }

    // 5. Authoritative Profile Lookup by Identifier
    const normalizedIdentifier = identifier.trim().toUpperCase();
    const { data: profile, error: lookupError } = await admin
      .from("profiles")
      .select("email, account_status")
      .ilike("usn_or_employee_id", normalizedIdentifier)
      .maybeSingle();

    if (lookupError || !profile || profile.account_status !== "ACTIVE") {
      // Record failed attempt against the HMAC-hashed identifier
      await admin.rpc("record_failed_identifier_attempt", { p_identifier_hash: identifierHash });
      return json({ error: "Invalid credentials or account unavailable." }, 401);
    }

    // 6. Supabase GoTrue Password Authentication
    const auth = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data: authData, error: authError } = await auth.auth.signInWithPassword({
      email: profile.email,
      password,
    });

    if (authError || !authData?.session) {
      // Record failed attempt against the HMAC-hashed identifier
      await admin.rpc("record_failed_identifier_attempt", { p_identifier_hash: identifierHash });
      return json({ error: "Invalid credentials or account unavailable." }, 401);
    }

    // 7. Successful Authentication -> Clear Failed Attempts Counter
    await admin.rpc("clear_identifier_rate_limit", { p_identifier_hash: identifierHash });

    return json({ session: authData.session }, 200);
  } catch (error) {
    console.error("Identifier login failed:", error instanceof Error ? error.message : "Unknown error");
    return json({ error: "Authentication service is temporarily unavailable." }, 500);
  }
});
