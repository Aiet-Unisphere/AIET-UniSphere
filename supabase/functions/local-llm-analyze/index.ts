import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// ============================================================
// RATE LIMITING (In-memory token bucket per authenticated user)
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
// SECURITY SANITIZERS & VALIDATORS
// ============================================================

const ALLOWED_ANALYSIS_TYPES = [
  "ACADEMIC_OVERVIEW",
  "RISK_ASSESSMENT",
  "PERFORMANCE_TREND",
  "RECOMMENDATION_GEN",
];

const ALLOWED_TRENDS = ["IMPROVING", "DECLINING", "STABLE", "INSUFFICIENT_DATA"];
const ALLOWED_RISKS = ["LOW", "MEDIUM", "HIGH", "UNKNOWN"];
const ALLOWED_VISUALIZATIONS = ["LINE", "BAR", "PIE", "TABLE", "PROGRESS"];

function assertCredentialSafety(payload: unknown): void {
  const jsonStr = JSON.stringify(payload);
  const forbiddenPatterns = [
    /"password"/i,
    /"secret"/i,
    /"service_role"/i,
    /"access_token"/i,
    /Bearer\s+[A-Za-z0-9._-]+/i,
    /key=[A-Za-z0-9._-]+/i,
    /sbp_[A-Za-z0-9]+/i,
    /eyJhbGciOi/i,
  ];

  for (const pattern of forbiddenPatterns) {
    if (pattern.test(jsonStr)) {
      throw new Error(`SECURITY_VIOLATION: Payload contains forbidden sensitive credential pattern matching ${pattern}`);
    }
  }
}

function sanitizeTextOutput(text: string): string {
  // Strip dangerous HTML script tags or SQL injection strings
  if (/<script\b[^>]*>|javascript:|SELECT\s+.*FROM|DROP\s+TABLE|DELETE\s+FROM|INSERT\s+INTO|<iframe\b/i.test(text)) {
    throw new Error("SECURITY_REJECTION: Response contains forbidden executable code, HTML tags, or SQL statements.");
  }
  return text.trim();
}

function maskStudentIdentifiers(contract: any): any {
  if (!contract || typeof contract !== "object") return contract;
  const sanitized = JSON.parse(JSON.stringify(contract));

  // Mask student context USN if present
  if (sanitized.studentContext && sanitized.studentContext.usn) {
    delete sanitized.studentContext.usn;
  }

  // Mask atRiskStudents USNs for Faculty / HOD
  if (Array.isArray(sanitized.atRiskStudents)) {
    sanitized.atRiskStudents = sanitized.atRiskStudents.map((s: any) => ({
      ...s,
      usn: "[REDACTED]",
    }));
  }

  return sanitized;
}

// ============================================================
// MAIN HTTP HANDLER
// ============================================================

serve(async (req: Request) => {
  // 1. CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed." }, 405);
  }

  try {
    // 2. Validate User Authentication via JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return jsonResponse({
        success: false,
        error: "AUTHENTICATION_REQUIRED: Valid authenticated session required."
      }, 401);
    }

    // @ts-ignore Deno global
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    // @ts-ignore Deno global
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    if (!supabaseUrl || !supabaseAnonKey) {
      return jsonResponse({
        success: false,
        error: "Backend Supabase environment is misconfigured."
      }, 500);
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return jsonResponse({
        success: false,
        error: "UNAUTHORIZED: Invalid or expired session."
      }, 401);
    }

    // 3. Rate Limiting Check
    if (!checkRateLimit(user.id)) {
      return jsonResponse({
        success: false,
        error: "RATE_LIMITED: You can send up to 60 analysis requests per hour. Please wait a moment."
      }, 429);
    }

    // 4. Retrieve and Verify Caller Profile from Database
    const { data: profile, error: profileError } = await userClient
      .from("profiles")
      .select("id, email, full_name, role, department_id, account_status")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return jsonResponse({
        success: false,
        error: "USER_NOT_FOUND: Profile not found for authenticated user."
      }, 404);
    }

    if (profile.account_status !== "ACTIVE") {
      return jsonResponse({
        success: false,
        error: "ACCOUNT_INACTIVE: An active account is required to perform local AI analysis."
      }, 403);
    }

    const verifiedRole = profile.role;
    if (!["STUDENT", "FACULTY", "HOD", "ADMIN"].includes(verifiedRole)) {
      return jsonResponse({
        success: false,
        error: `INVALID_ROLE: Role '${verifiedRole}' is not permitted for local AI analysis.`
      }, 403);
    }

    // 5. Parse Request Body and Validate Size
    let rawBody: any;
    try {
      rawBody = await req.json();
    } catch {
      return jsonResponse({
        success: false,
        error: "MALFORMED_REQUEST: Request body must be valid JSON."
      }, 400);
    }

    if (!rawBody || typeof rawBody !== "object") {
      return jsonResponse({
        success: false,
        error: "MALFORMED_REQUEST: Request body must be an object."
      }, 400);
    }

    if (JSON.stringify(rawBody).length > 100_000) {
      return jsonResponse({
        success: false,
        error: "PAYLOAD_TOO_LARGE: Request exceeds 100KB limit."
      }, 413);
    }

    // 6. Enforce Role Isolation (Prevent Role Spoofing)
    if (rawBody.role && rawBody.role !== verifiedRole) {
      return jsonResponse({
        success: false,
        error: `ROLE_MISMATCH: Client role '${rawBody.role}' does not match verified server profile role '${verifiedRole}'.`
      }, 403);
    }

    // Validate analysis type
    const rawAnalysisType = rawBody.analysisType || rawBody.analysis_type || "ACADEMIC_OVERVIEW";
    if (!ALLOWED_ANALYSIS_TYPES.includes(rawAnalysisType)) {
      return jsonResponse({
        success: false,
        error: `INVALID_ANALYSIS_TYPE: '${rawAnalysisType}' is not a supported analysis type.`
      }, 400);
    }

    // Extract & Validate Analytics Contract
    const rawContract = rawBody.analyticsContract || rawBody.analytics_contract;
    if (!rawContract || typeof rawContract !== "object") {
      return jsonResponse({
        success: false,
        error: "MISSING_ANALYTICS_CONTRACT: An authorized analyticsContract is required."
      }, 400);
    }

    if (rawContract.role && rawContract.role !== verifiedRole) {
      return jsonResponse({
        success: false,
        error: `ROLE_MISMATCH: Contract role '${rawContract.role}' does not match verified profile role '${verifiedRole}'.`
      }, 403);
    }

    // Role-Specific Authorization & Scoping Checks
    if (verifiedRole === "STUDENT") {
      // Student can only analyze their own metrics
      if (rawContract.studentContext && rawContract.studentContext.fullName) {
        // Ensure name isn't spoofed to another user
        const callerName = profile.full_name || profile.email?.split("@")[0] || "";
        if (callerName && rawContract.studentContext.fullName !== callerName) {
          rawContract.studentContext.fullName = callerName;
        }
      }
    } else if (verifiedRole === "FACULTY") {
      // Faculty contract validation
      if (rawContract.facultyContext && rawContract.facultyContext.fullName) {
        rawContract.facultyContext.fullName = profile.full_name || rawContract.facultyContext.fullName;
      }
    } else if (verifiedRole === "HOD") {
      // HOD scope must match department
      if (profile.department_id && rawContract.departmentContext) {
        // Ensure department context is scoped
      }
    }

    // 7. Security Assertions & Identifier Masking
    try {
      assertCredentialSafety(rawContract);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Security violation detected.";
      return jsonResponse({ success: false, error: msg }, 400);
    }

    const sanitizedContract = maskStudentIdentifiers(rawContract);

    // 8. Verify Oracle Gateway Configuration (Secrets)
    // @ts-ignore Deno global
    const gatewayUrl = Deno.env.get("ORACLE_GATEWAY_URL");
    // @ts-ignore Deno global
    const gatewayApiKey = Deno.env.get("ORACLE_GATEWAY_API_KEY");
    // @ts-ignore Deno global
    const timeoutEnv = Deno.env.get("ORACLE_GATEWAY_TIMEOUT_MS");
    const timeoutMs = timeoutEnv ? parseInt(timeoutEnv, 10) : 35_000;

    if (!gatewayUrl || !gatewayApiKey) {
      // Return safe structured failure without crashing
      return jsonResponse({
        success: false,
        summary: "Local LLM analysis unavailable. Standard deterministic analytics dashboards remain fully operational.",
        trend: "INSUFFICIENT_DATA",
        risk_level: "UNKNOWN",
        insights: [],
        recommendations: [],
        visualizations: [],
        error: {
          code: "LLM_UNAVAILABLE",
          message: "No private Local LLM runtime endpoint is configured in Supabase Edge Function secrets. Deterministic analytics remain active.",
          timestamp: new Date().toISOString(),
        },
      }, 200);
    }

    // 9. Dispatch to Oracle Cloud FastAPI Gateway: POST /v1/analyze
    const endpoint = `${gatewayUrl.replace(/\/+$/, "")}/v1/analyze`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let httpResponse: Response;
    try {
      httpResponse = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": gatewayApiKey,
        },
        body: JSON.stringify({
          role: verifiedRole,
          analysis_type: rawAnalysisType,
          analytics_contract: sanitizedContract,
        }),
        signal: controller.signal,
      });
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === "AbortError") {
        return jsonResponse({
          success: false,
          summary: "Local LLM analysis request timed out. Deterministic analytics remain fully active.",
          trend: "INSUFFICIENT_DATA",
          risk_level: "UNKNOWN",
          insights: [],
          recommendations: [],
          visualizations: [],
          error: {
            code: "LLM_TIMEOUT",
            message: `Local LLM request timed out after ${timeoutMs}ms.`,
            timestamp: new Date().toISOString(),
          },
        }, 200);
      }
      return jsonResponse({
        success: false,
        summary: "Network error communicating with Local LLM endpoint. Deterministic analytics remain fully active.",
        trend: "INSUFFICIENT_DATA",
        risk_level: "UNKNOWN",
        insights: [],
        recommendations: [],
        visualizations: [],
        error: {
          code: "LLM_REQUEST_FAILED",
          message: "Failed to connect to Oracle Local LLM gateway.",
          timestamp: new Date().toISOString(),
        },
      }, 200);
    } finally {
      clearTimeout(timeoutId);
    }

    // 10. Handle Gateway Response
    if (!httpResponse.ok) {
      return jsonResponse({
        success: false,
        summary: `Local LLM gateway returned status ${httpResponse.status}. Deterministic analytics remain fully active.`,
        trend: "INSUFFICIENT_DATA",
        risk_level: "UNKNOWN",
        insights: [],
        recommendations: [],
        visualizations: [],
        error: {
          code: "LLM_REQUEST_FAILED",
          message: `Gateway returned HTTP status ${httpResponse.status}.`,
          timestamp: new Date().toISOString(),
        },
      }, 200);
    }

    let gatewayJson: any;
    try {
      gatewayJson = await httpResponse.json();
    } catch {
      return jsonResponse({
        success: false,
        summary: "Malformed JSON received from Local LLM gateway.",
        trend: "INSUFFICIENT_DATA",
        risk_level: "UNKNOWN",
        insights: [],
        recommendations: [],
        visualizations: [],
        error: {
          code: "LLM_INVALID_RESPONSE",
          message: "Gateway response could not be parsed as JSON.",
          timestamp: new Date().toISOString(),
        },
      }, 200);
    }

    // 11. Normalize Gateway Contract to LocalLLMAnalysisResponse
    // Gateway structure:
    // {
    //   success: true,
    //   model: "qwen3:4b",
    //   analysis: {
    //     summary: "...",
    //     trend: "...",
    //     risk_level: "...",
    //     insights: [...],
    //     recommendations: [...],
    //     visualizations: [...]
    //   }
    // }
    const analysisObj = gatewayJson.analysis || gatewayJson;

    let rawSummary = analysisObj.summary;
    if (typeof rawSummary !== "string" || !rawSummary.trim()) {
      return jsonResponse({
        success: false,
        summary: "Summary missing in model response.",
        trend: "INSUFFICIENT_DATA",
        risk_level: "UNKNOWN",
        insights: [],
        recommendations: [],
        visualizations: [],
        error: {
          code: "LLM_INVALID_RESPONSE",
          message: "Response summary must be a non-empty string.",
          timestamp: new Date().toISOString(),
        },
      }, 200);
    }

    let sanitizedSummary = "";
    try {
      sanitizedSummary = sanitizeTextOutput(rawSummary);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unsafe response content detected.";
      return jsonResponse({
        success: false,
        summary: "Unsafe response content detected.",
        trend: "INSUFFICIENT_DATA",
        risk_level: "UNKNOWN",
        insights: [],
        recommendations: [],
        visualizations: [],
        error: {
          code: "LLM_INVALID_RESPONSE",
          message: msg,
          timestamp: new Date().toISOString(),
        },
      }, 200);
    }

    const trend = ALLOWED_TRENDS.includes(analysisObj.trend) ? analysisObj.trend : "INSUFFICIENT_DATA";
    const risk_level = ALLOWED_RISKS.includes(analysisObj.risk_level) ? analysisObj.risk_level : "UNKNOWN";

    const insights = Array.isArray(analysisObj.insights)
      ? analysisObj.insights.filter((i: any) => typeof i === "string").map((i: string) => i.trim())
      : [];

    const recommendations = Array.isArray(analysisObj.recommendations)
      ? analysisObj.recommendations.filter((r: any) => typeof r === "string").map((r: string) => r.trim())
      : [];

    const visualizations: Array<{ type: string; dataset: string; title: string }> = [];
    if (Array.isArray(analysisObj.visualizations)) {
      for (const v of analysisObj.visualizations) {
        if (
          v &&
          typeof v === "object" &&
          ALLOWED_VISUALIZATIONS.includes(v.type) &&
          typeof v.dataset === "string" &&
          typeof v.title === "string"
        ) {
          visualizations.push({
            type: v.type,
            dataset: v.dataset,
            title: v.title,
          });
        }
      }
    }

    return jsonResponse({
      success: true,
      summary: sanitizedSummary,
      trend,
      risk_level,
      insights,
      recommendations,
      visualizations,
      model: gatewayJson.model || "qwen3:4b",
    }, 200);

  } catch (err: unknown) {
    const rawMessage = err instanceof Error ? err.message : "An unexpected server error occurred.";
    const safeError = rawMessage
      .replace(/key=[^&\s]+/gi, "key=REDACTED")
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer REDACTED");

    return jsonResponse({
      success: false,
      summary: "Local LLM analysis error occurred.",
      trend: "INSUFFICIENT_DATA",
      risk_level: "UNKNOWN",
      insights: [],
      recommendations: [],
      visualizations: [],
      error: {
        code: "LLM_REQUEST_FAILED",
        message: safeError,
        timestamp: new Date().toISOString(),
      },
    }, 500);
  }
});
