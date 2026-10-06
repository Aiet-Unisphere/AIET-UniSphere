import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { classifyIntent, buildUserAcademicContext } from "../_shared/ai/context.ts";
import { buildDeterministicResponse } from "../_shared/ai/prompts.ts";
import { AIChatRequestBody, AIChatResponseBody } from "../_shared/ai/types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================================
// RATE LIMITING (Token bucket per authenticated user)
// ============================================================

const userRequestCounts = new Map<string, { count: number; resetTime: number }>();
const MAX_REQUESTS_PER_HOUR = 60;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;
  const userRate = userRequestCounts.get(userId);

  if (!userRate || now > userRate.resetTime) {
    userRequestCounts.set(userId, { count: 1, resetTime: now + hourMs });
    return true;
  }

  if (userRate.count >= MAX_REQUESTS_PER_HOUR) {
    return false;
  }

  userRate.count++;
  return true;
}

// ============================================================
// MAIN HTTP HANDLER
// ============================================================

serve(async (req: Request) => {
  // CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed." }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // 1. Authenticate user from JWT Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ success: false, error: "Authentication required." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // @ts-ignore Deno global
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    // @ts-ignore Deno global
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    if (!supabaseUrl || !supabaseAnonKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Backend Supabase environment is misconfigured." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized: Invalid or expired session." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Enforce Rate Limiting
    if (!checkRateLimit(user.id)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Rate limit reached. You can send up to 60 messages per hour. Please wait a moment."
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Verify Account Status & Identity
    const { data: profile, error: profileError } = await userClient
      .from('profiles')
      .select('id, email, full_name, role, department_id, account_status, departments(name)')
      .eq('id', user.id)
      .single();

    if (profileError || !profile || profile.account_status !== 'ACTIVE') {
      return new Response(
        JSON.stringify({ success: false, error: "An active account is required to use AIET-UniSphere AI." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Parse & Validate Request Body
    const body: AIChatRequestBody = await req.json();
    const { message, conversationId } = body;
    const rawCourseContext = body.courseContext !== undefined ? body.courseContext : body.courseContextId;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Message cannot be empty." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (message.length > 4000) {
      return new Response(
        JSON.stringify({ success: false, error: "Message exceeds maximum allowed length of 4000 characters." }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let courseContext: string | null = null;
    if (rawCourseContext !== undefined && rawCourseContext !== null) {
      if (typeof rawCourseContext !== 'string') {
        return new Response(
          JSON.stringify({ success: false, error: "Invalid course context identifier." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const trimmed = rawCourseContext.trim();
      if (trimmed.length > 120) {
        return new Response(
          JSON.stringify({ success: false, error: "Invalid course context identifier." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (trimmed !== '' && trimmed.toLowerCase() !== 'all' && trimmed !== 'All Courses') {
        courseContext = trimmed;
      }
    }

    if (conversationId !== undefined && conversationId !== null && (typeof conversationId !== 'string' || !/^[0-9a-f-]{36}$/i.test(conversationId))) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid conversation identifier." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanMessage = message.trim();
    let activeConversationId: string | null = conversationId || null;
    let recentHistory: Array<{ role: string; content: string }> = [];

    // 5. Load and Verify Conversation Ownership
    if (activeConversationId) {
      const { data: conversation, error: conversationError } = await userClient
        .from('ai_conversations')
        .select('id')
        .eq('id', activeConversationId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (conversationError || !conversation) {
        return new Response(
          JSON.stringify({ success: false, error: "Conversation not found or not owned by current user." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Load chronological message history (last 10 messages)
      const { data: history, error: historyError } = await userClient
        .from('ai_messages')
        .select('sender, content')
        .eq('conversation_id', activeConversationId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (historyError) {
        throw new Error(`Failed to load conversation history: ${historyError.message}`);
      }

      recentHistory = (history || []).reverse().map((item: any) => ({
        role: item.sender === 'ai' ? 'model' : 'user',
        content: item.content,
      }));
    }

    // 6. Classify Academic Intent
    const intent = classifyIntent(cleanMessage, courseContext);

    // 7. Build Scoped & Authorized Academic Context
    const userAcademicContext = await buildUserAcademicContext(
      userClient,
      user,
      profile,
      intent,
      courseContext,
      cleanMessage
    );

    // 8. Generate Deterministic Internal Response from Authorized Data Context
    const replyText = buildDeterministicResponse(userAcademicContext, cleanMessage);
    const provider = "internal";

    // 9. Persist Conversation & Messages
    if (!activeConversationId) {
      const title = cleanMessage.length > 40
        ? `${cleanMessage.substring(0, 40)}...`
        : cleanMessage;

      const { data: newConv, error: createError } = await userClient
        .from('ai_conversations')
        .insert({
          user_id: user.id,
          title,
          course_context: courseContext || null,
          model_provider: provider,
        })
        .select('id')
        .single();

      if (createError || !newConv) {
        throw new Error(`Failed to create conversation session: ${createError?.message || 'Unknown database error'}`);
      }
      activeConversationId = newConv.id;
    } else {
      const { error: updateError } = await userClient
        .from('ai_conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', activeConversationId)
        .eq('user_id', user.id);

      if (updateError) {
        console.warn("Could not update conversation timestamp:", updateError.message);
      }
    }

    // Save user message
    const { error: userMsgErr } = await userClient.from('ai_messages').insert({
      conversation_id: activeConversationId,
      user_id: user.id,
      sender: 'user',
      content: cleanMessage,
    });
    if (userMsgErr) {
      throw new Error(`Failed to persist user message: ${userMsgErr.message}`);
    }

    // Save AI response message
    const { error: aiMsgErr } = await userClient.from('ai_messages').insert({
      conversation_id: activeConversationId,
      user_id: user.id,
      sender: 'ai',
      content: replyText,
      tokens_used: null,
    });
    if (aiMsgErr) {
      throw new Error(`Failed to persist assistant message: ${aiMsgErr.message}`);
    }

    // 10. Return Stable JSON Response
    const responsePayload: AIChatResponseBody = {
      success: true,
      reply: replyText,
      message: replyText,
      conversationId: activeConversationId,
      provider: provider,
      tokensUsed: 0,
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      },
      intent,
      citations: userAcademicContext.citations || undefined,
    };

    return new Response(
      JSON.stringify(responsePayload),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: unknown) {
    const rawMessage = err instanceof Error ? err.message : "An unexpected server error occurred.";
    console.error("AI Chat Edge Function exception:", rawMessage);

    // Sanitize any key leakage from error message
    const safeError = rawMessage.replace(/key=[^&\s]+/gi, "key=REDACTED");

    const isClientError = safeError.includes("rate limit") ||
      safeError.includes("flagged by safety") ||
      safeError.includes("character limit") ||
      safeError.includes("Authentication required") ||
      safeError.includes("active account is required");

    const statusCode = safeError.includes("rate limit") ? 429 : isClientError ? 400 : 500;

    return new Response(
      JSON.stringify({
        success: false,
        error: isClientError ? safeError : "The AI assistant is temporarily unavailable. Please try again in a moment.",
        details: isClientError ? undefined : safeError,
      }),
      { status: statusCode, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
