import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization) return json({ error: "Authentication required." }, 401);

    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceRoleKey) return json({ error: "GitHub service is unavailable." }, 503);

    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: "Invalid or expired session." }, 401);

    const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("account_status")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError || profile?.account_status !== "ACTIVE") return json({ error: "An active account is required." }, 403);

    const request = await req.json();
    const path = request?.path;
    const method = String(request?.method || "GET").toUpperCase();
    if (
      typeof path !== "string" ||
      !/^\/(?:user(?:\/repos)?|rate_limit|repos\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[^?#]*)?)(?:\?[^#]*)?$/.test(path) ||
      path.includes("..") ||
      !["GET", "PUT", "DELETE"].includes(method)
    ) {
      return json({ error: "Unsupported GitHub API request." }, 400);
    }

    const { data: connection, error: connectionError } = await admin
      .from("github_connections")
      .select("access_token")
      .eq("user_id", user.id)
      .maybeSingle();
    if (connectionError || !connection?.access_token) return json({ error: "GitHub account is not connected." }, 404);

    const body = request.body;
    if (body !== undefined && JSON.stringify(body).length > 1_000_000) {
      return json({ error: "GitHub request payload is too large." }, 413);
    }

    const githubResponse = await fetch(`https://api.github.com${path}`, {
      method,
      headers: {
        "Authorization": `Bearer ${connection.access_token}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "AIET-UniSphere-App",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(20000),
    });

    const responseBody = await githubResponse.json().catch(() => ({}));
    return json({ status: githubResponse.status, body: responseBody }, 200);
  } catch (error) {
    console.error("GitHub proxy request failed:", error instanceof Error ? error.message : "Unknown error");
    return json({ error: "GitHub request is temporarily unavailable." }, 500);
  }
});