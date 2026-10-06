/**
 * AIET-UniSphere - Local LLM Integration Contracts & Security Boundary
 * 
 * ARCHITECTURAL & SECURITY RULES:
 * 1. Local LLM is NOT an authorization layer.
 * 2. Local LLM cannot query Supabase directly.
 * 3. Local LLM cannot execute SQL.
 * 4. Local LLM cannot decide user role or permission boundaries.
 * 5. Authorization happens BEFORE analytics data reaches the model.
 * 6. Only pre-authorized, validated Analytics AI contract JSON crosses this boundary.
 * 7. No credentials, tokens, service role keys, or secrets cross this boundary.
 * 8. Basic AI remains completely independent and deterministic.
 * 9. Existing Supabase RLS remains the authoritative security provider.
 * 10. Visualizations are described as typed JSON specs; React components render them safely.
 */

import type { AnalyticsRole, AnalyticsAIContractPayload } from './analyticsAI';

// -------------------------------------------------------------
// CONFIGURATION CONTRACT
// -------------------------------------------------------------
export interface LocalLLMConfig {
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  maxTokens?: number;
  temperature?: number;
}

// -------------------------------------------------------------
// ERROR CODES & FAILURE STATES
// -------------------------------------------------------------
export type LocalLLMErrorCode =
  | 'LLM_UNAVAILABLE'
  | 'LLM_TIMEOUT'
  | 'LLM_INVALID_RESPONSE'
  | 'LLM_CONFIGURATION_ERROR'
  | 'LLM_REQUEST_FAILED';

export interface LocalLLMFailureState {
  code: LocalLLMErrorCode;
  message: string;
  timestamp: string;
}

// -------------------------------------------------------------
// ANALYSIS TYPE & VISUALIZATION TYPES
// -------------------------------------------------------------
export type LocalLLMAnalysisType =
  | 'ACADEMIC_OVERVIEW'
  | 'RISK_ASSESSMENT'
  | 'PERFORMANCE_TREND'
  | 'RECOMMENDATION_GEN';

export type VisualizationType = 'LINE' | 'BAR' | 'PIE' | 'TABLE' | 'PROGRESS';

export interface VisualizationSpec {
  type: VisualizationType;
  dataset: string;
  title: string;
  description?: string;
}

// -------------------------------------------------------------
// REQUEST CONTRACT
// -------------------------------------------------------------
export interface LocalLLMAnalysisRequest {
  role: AnalyticsRole;
  analyticsContract: AnalyticsAIContractPayload;
  analysisType?: LocalLLMAnalysisType;
  dashboardContext?: string;
  timestamp: string; // ISO 8601
}

// -------------------------------------------------------------
// RESPONSE CONTRACT
// -------------------------------------------------------------
export interface LocalLLMAnalysisResponse {
  success: boolean;
  summary: string;
  trend: 'IMPROVING' | 'DECLINING' | 'STABLE' | 'INSUFFICIENT_DATA';
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
  insights: string[];
  recommendations: string[];
  visualizations: VisualizationSpec[];
  error?: LocalLLMFailureState;
}

// -------------------------------------------------------------
// RUNTIME VALIDATION & SECURITY ASSERTIONS
// -------------------------------------------------------------

const ALLOWED_TRENDS = ['IMPROVING', 'DECLINING', 'STABLE', 'INSUFFICIENT_DATA'];
const ALLOWED_RISKS = ['LOW', 'MEDIUM', 'HIGH', 'UNKNOWN'];
const ALLOWED_VISUALIZATIONS = ['LINE', 'BAR', 'PIE', 'TABLE', 'PROGRESS'];

/**
 * Validates an incoming Local LLM Request Contract at runtime.
 */
export function validateLocalLLMRequest(req: unknown): LocalLLMAnalysisRequest {
  if (!req || typeof req !== 'object') {
    throw new Error('MALFORMED_REQUEST: Local LLM request must be a non-null object.');
  }

  const r = req as any;

  if (!['STUDENT', 'FACULTY', 'HOD'].includes(r.role)) {
    throw new Error(`INVALID_ROLE: Role '${r.role}' is not allowed for Local LLM analysis.`);
  }

  if (!r.analyticsContract || typeof r.analyticsContract !== 'object') {
    throw new Error('MISSING_ANALYTICS_CONTRACT: Request must contain a valid analyticsContract payload.');
  }

  if (r.analyticsContract.role !== r.role) {
    throw new Error(`ROLE_MISMATCH: Request role '${r.role}' does not match contract role '${r.analyticsContract.role}'.`);
  }

  if (typeof r.timestamp !== 'string' || isNaN(Date.parse(r.timestamp))) {
    throw new Error('INVALID_TIMESTAMP: Request must include a valid ISO timestamp string.');
  }

  assertLocalLLMSafety(r);
  return r as LocalLLMAnalysisRequest;
}

/**
 * Validates a Local LLM Response Contract at runtime.
 * Rejects malformed JSON, SQL, HTML/script tags, and executable constructs.
 */
export function validateLocalLLMResponse(res: unknown): LocalLLMAnalysisResponse {
  if (!res || typeof res !== 'object') {
    return {
      success: false,
      summary: 'Analytics synthesis failed due to malformed LLM response.',
      trend: 'INSUFFICIENT_DATA',
      risk_level: 'UNKNOWN',
      insights: [],
      recommendations: [],
      visualizations: [],
      error: {
        code: 'LLM_INVALID_RESPONSE',
        message: 'MALFORMED_RESPONSE: Response payload is not a valid object.',
        timestamp: new Date().toISOString(),
      },
    };
  }

  const r = res as any;

  // If payload represents an explicit failure state
  if (r.success === false || r.error) {
    return {
      success: false,
      summary: typeof r.summary === 'string' ? r.summary : 'Local LLM analysis unavailable.',
      trend: 'INSUFFICIENT_DATA',
      risk_level: 'UNKNOWN',
      insights: [],
      recommendations: [],
      visualizations: [],
      error: {
        code: r.error?.code || 'LLM_REQUEST_FAILED',
        message: r.error?.message || 'Local LLM request failed.',
        timestamp: new Date().toISOString(),
      },
    };
  }

  // Validate required string summary
  if (typeof r.summary !== 'string' || !r.summary.trim()) {
    return {
      success: false,
      summary: 'Summary missing in LLM response.',
      trend: 'INSUFFICIENT_DATA',
      risk_level: 'UNKNOWN',
      insights: [],
      recommendations: [],
      visualizations: [],
      error: {
        code: 'LLM_INVALID_RESPONSE',
        message: 'MISSING_FIELD: Response summary must be a non-empty string.',
        timestamp: new Date().toISOString(),
      },
    };
  }

  // Check for executable HTML/JS or SQL injection content in output text
  const strContent = JSON.stringify(r);
  if (/<script\b[^>]*>|javascript:|SELECT\s+.*FROM|DROP\s+TABLE|DELETE\s+FROM|INSERT\s+INTO|<iframe\b/i.test(strContent)) {
    return {
      success: false,
      summary: 'Unsafe response content detected.',
      trend: 'INSUFFICIENT_DATA',
      risk_level: 'UNKNOWN',
      insights: [],
      recommendations: [],
      visualizations: [],
      error: {
        code: 'LLM_INVALID_RESPONSE',
        message: 'SECURITY_REJECTION: Response contains forbidden executable code, HTML tags, or SQL statements.',
        timestamp: new Date().toISOString(),
      },
    };
  }

  // Validate enumerated fields
  const trend = ALLOWED_TRENDS.includes(r.trend) ? r.trend : 'INSUFFICIENT_DATA';
  const risk_level = ALLOWED_RISKS.includes(r.risk_level) ? r.risk_level : 'UNKNOWN';

  // Validate arrays
  const insights = Array.isArray(r.insights) ? r.insights.filter((i: any) => typeof i === 'string') : [];
  const recommendations = Array.isArray(r.recommendations) ? r.recommendations.filter((rec: any) => typeof rec === 'string') : [];

  // Validate visualization specs strictly
  const visualizations: VisualizationSpec[] = [];
  if (Array.isArray(r.visualizations)) {
    for (const v of r.visualizations) {
      if (v && typeof v === 'object' && ALLOWED_VISUALIZATIONS.includes(v.type) && typeof v.dataset === 'string' && typeof v.title === 'string') {
        visualizations.push({
          type: v.type as VisualizationType,
          dataset: v.dataset,
          title: v.title,
          description: typeof v.description === 'string' ? v.description : undefined,
        });
      } else {
        // If any visualization spec is unsupported or malformed, fail safely
        return {
          success: false,
          summary: 'Invalid visualization specification detected.',
          trend: 'INSUFFICIENT_DATA',
          risk_level: 'UNKNOWN',
          insights: [],
          recommendations: [],
          visualizations: [],
          error: {
            code: 'LLM_INVALID_RESPONSE',
            message: `UNSUPPORTED_VISUALIZATION: Visualization type '${v?.type}' or schema is invalid.`,
            timestamp: new Date().toISOString(),
          },
        };
      }
    }
  }

  return {
    success: true,
    summary: r.summary.trim(),
    trend,
    risk_level,
    insights,
    recommendations,
    visualizations,
  };
}

/**
 * Asserts that no sensitive credentials, secrets, or JWT tokens are present in any Local LLM request.
 */
export function assertLocalLLMSafety(payload: unknown): boolean {
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
      throw new Error(`SECURITY_VIOLATION: Local LLM payload contains forbidden credential pattern matching ${pattern}`);
    }
  }
  return true;
}
