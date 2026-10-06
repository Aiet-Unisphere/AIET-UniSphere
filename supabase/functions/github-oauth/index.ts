import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization token." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    // 1. Verify caller authentication using anon client + Bearer JWT token
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller }, error: callerError } = await userClient.auth.getUser();
    if (callerError || !caller) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid or expired authentication session." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: callerProfile, error: profileError } = await userClient
      .from("profiles")
      .select("account_status")
      .eq("id", caller.id)
      .maybeSingle();
    if (profileError || callerProfile?.account_status !== "ACTIVE") {
      return new Response(
        JSON.stringify({ error: "An active account is required to connect GitHub." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { code, redirect_uri } = body;

    if (!code) {
      return new Response(
        JSON.stringify({ error: "Authorization code is required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const githubClientId = Deno.env.get("GITHUB_CLIENT_ID");
    const githubClientSecret = Deno.env.get("GITHUB_CLIENT_SECRET");

    if (!githubClientId || !githubClientSecret) {
      return new Response(
        JSON.stringify({ error: "GitHub OAuth client secrets are not configured on server." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Exchange code for access token with GitHub API
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        client_id: githubClientId,
        client_secret: githubClientSecret,
        code: code,
        redirect_uri: redirect_uri,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error || !tokenData.access_token) {
      return new Response(
        JSON.stringify({ error: tokenData.error_description || tokenData.error || "Failed to exchange GitHub authorization code." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const accessToken = tokenData.access_token;
    const tokenType = tokenData.token_type || "bearer";
    const scope = tokenData.scope || "";

    // 3. Fetch GitHub User Profile using access token
    const ghUserResponse = await fetch("https://api.github.com/user", {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "User-Agent": "AIET-UniSphere-App",
        "Accept": "application/json",
      },
    });

    if (!ghUserResponse.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch GitHub profile for authenticated user." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ghUser = await ghUserResponse.json();

    // 4. Store connection securely in Supabase github_connections table
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: connectionRecord, error: dbError } = await supabaseAdmin
      .from("github_connections")
      .upsert(
        {
          user_id: caller.id,
          github_user_id: String(ghUser.id),
          github_username: ghUser.login,
          avatar_url: ghUser.avatar_url,
          access_token: accessToken,
          token_type: tokenType,
          scope: scope,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      )
      .select()
      .single();

    if (dbError || !connectionRecord) {
      console.error("GitHub connection could not be stored securely:", dbError?.message || "No record returned.");
      return new Response(
        JSON.stringify({ error: "GitHub connection could not be saved. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "GitHub account connected successfully.",
        connection: {
          id: connectionRecord.id,
          username: ghUser.login,
          avatarUrl: ghUser.avatar_url,
          githubUserId: ghUser.id,
          scope: scope,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal server error.";
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
