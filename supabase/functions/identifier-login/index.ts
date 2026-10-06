import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status: number) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const { identifier, password } = await req.json();
    if (
      typeof identifier !== "string" ||
      !/^[A-Za-z0-9._-]{2,64}$/.test(identifier.trim()) ||
      typeof password !== "string" ||
      password.length === 0 || password.length > 256
    ) {
      return json({ error: "Invalid credentials." }, 401);
    }

    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceRoleKey) {
      return json({ error: "Authentication service is unavailable." }, 503);
    }

    const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
    const { data: profile, error: lookupError } = await admin
      .from("profiles")
      .select("email, account_status")
      .ilike("usn_or_employee_id", identifier.trim())
      .maybeSingle();

    if (lookupError || !profile || profile.account_status !== "ACTIVE") {
      return json({ error: "Invalid credentials or account unavailable." }, 401);
    }

    const auth = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data, error } = await auth.auth.signInWithPassword({
      email: profile.email,
      password,
    });

    if (error || !data.session) {
      return json({ error: "Invalid credentials or account unavailable." }, 401);
    }

    return json({ session: data.session }, 200);
  } catch (error) {
    console.error("Identifier login failed:", error instanceof Error ? error.message : "Unknown error");
    return json({ error: "Authentication service is temporarily unavailable." }, 500);
  }
});