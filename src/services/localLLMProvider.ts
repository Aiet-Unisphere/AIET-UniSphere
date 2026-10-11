/**
 * AIET-UniSphere - Provider-Neutral Local LLM Abstraction & Boundary Adapter
 * 
 * ARCHITECTURAL & SECURITY RULES:
 * 1. This abstraction decouples UniSphere from specific runtimes (Ollama, FastAPI, vLLM).
 * 2. It accepts ONLY authorized, pre-validated Analytics AI Contracts.
 * 3. All external gateway calls go through the secure Supabase Edge Function 'local-llm-analyze'.
 * 4. The browser NEVER communicates directly with the Oracle VM or Cloudflare tunnel.
 * 5. Gateway API credentials (X-API-Key) are strictly server-side in Supabase Secrets.
 * 6. When no local runtime is configured, it fails safely with 'LLM_UNAVAILABLE' without
 *    disrupting Basic AI or deterministic analytics dashboards.
 */

import { supabase } from '../lib/supabase';
import type {
  LocalLLMConfig,
  LocalLLMAnalysisRequest,
  LocalLLMAnalysisResponse,
  LocalLLMFailureState,
} from '../types/localLLM';
import {
  validateLocalLLMRequest,
  validateLocalLLMResponse,
} from '../types/localLLM';

export interface ILocalLLMProvider {
  /**
   * Analyzes structured Analytics AI contract payload and returns validated intelligence.
   */
  analyze(request: LocalLLMAnalysisRequest): Promise<LocalLLMAnalysisResponse>;

  /**
   * Returns true if local model integration is actively enabled and configured.
   */
  isConfigured(): boolean;

  /**
   * Returns current sanitized runtime configuration.
   */
  getConfig(): LocalLLMConfig;

  /**
   * Enables or disables local LLM analysis at runtime.
   */
  setEnabled?(enabled: boolean): void;
}

/**
 * Default Provider-Neutral Local LLM Boundary Adapter
 * Invokes the secure Supabase Edge Function 'local-llm-analyze'.
 */
export class DefaultLocalLLMProvider implements ILocalLLMProvider {
  private config: LocalLLMConfig;

  constructor(customConfig?: LocalLLMConfig) {
    const env = typeof globalThis !== 'undefined' ? (globalThis as any).process?.env : {};
    const viteEnv = typeof import.meta !== 'undefined' ? (import.meta as any).env : {};

    // Local AI feature is disabled by default unless explicitly configured/enabled
    const isExplicitlyEnabled = customConfig?.enabled !== undefined
      ? customConfig.enabled
      : (viteEnv?.VITE_LOCAL_LLM_ENABLED === 'true' || env?.LOCAL_LLM_ENABLED === 'true' || false);

    this.config = {
      baseUrl: customConfig?.baseUrl || env?.LOCAL_LLM_BASE_URL,
      model: customConfig?.model || env?.LOCAL_LLM_MODEL || 'qwen3:4b',
      timeoutMs: customConfig?.timeoutMs || 35000,
      maxTokens: customConfig?.maxTokens || 2048,
      temperature: customConfig?.temperature || 0.2,
      enabled: isExplicitlyEnabled,
    };
  }

  public isConfigured(): boolean {
    if (this.config.enabled !== undefined) {
      return Boolean(this.config.enabled);
    }
    return Boolean(this.config.baseUrl && this.config.baseUrl.trim().length > 0);
  }

  public setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  public getConfig(): LocalLLMConfig {
    return {
      baseUrl: this.isConfigured() ? 'CONFIGURED_SECURE_EDGE_PROXY' : undefined,
      model: this.config.model || 'qwen3:4b',
      timeoutMs: this.config.timeoutMs,
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature,
      enabled: this.config.enabled,
    };
  }

  public async analyze(rawRequest: LocalLLMAnalysisRequest): Promise<LocalLLMAnalysisResponse> {
    // 1. Validate request payload and security safety boundary
    let validatedReq: LocalLLMAnalysisRequest;
    try {
      validatedReq = validateLocalLLMRequest(rawRequest);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid request payload.';
      return this.buildFailureResponse('LLM_CONFIGURATION_ERROR', msg);
    }

    // 2. Check if Local LLM endpoint is enabled / configured
    if (!this.isConfigured()) {
      return this.buildFailureResponse(
        'LLM_UNAVAILABLE',
        'Local AI analysis is currently offline or disabled. Deterministic analytics remain active.'
      );
    }

    // 3. Dispatch to secure Supabase Edge Function 'local-llm-analyze'
    try {
      const { data, error } = await supabase.functions.invoke('local-llm-analyze', {
        body: {
          role: validatedReq.role,
          analysisType: validatedReq.analysisType || 'ACADEMIC_OVERVIEW',
          dashboardContext: validatedReq.dashboardContext,
          analyticsContract: validatedReq.analyticsContract,
          timestamp: validatedReq.timestamp,
        },
      });

      if (error) {
        return await this.handleFunctionsError(error);
      }

      if (!data) {
        return this.buildFailureResponse('LLM_INVALID_RESPONSE', 'Empty response received from Local LLM service.');
      }

      // If Edge Function returned a structured failure object
      if (data.success === false && data.error) {
        return this.buildFailureResponse(
          data.error.code || 'LLM_REQUEST_FAILED',
          data.error.message || 'Local LLM analysis failed.'
        );
      }

      return validateLocalLLMResponse(data);

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error communicating with local-llm-analyze service.';
      return this.buildFailureResponse('LLM_REQUEST_FAILED', msg);
    }
  }

  private async handleFunctionsError(error: any): Promise<LocalLLMAnalysisResponse> {
    let errorDetail = error.message || 'Local LLM service error';
    if (error.context && typeof error.context.json === 'function') {
      try {
        const errorJson = await error.context.json();
        errorDetail = errorJson?.error || errorJson?.message || errorDetail;
      } catch {
        // Non-JSON context
      }
    }

    const status = error.context?.status;
    let code: LocalLLMFailureState['code'] = 'LLM_REQUEST_FAILED';

    if (status === 504 || errorDetail.includes('timed out')) {
      code = 'LLM_TIMEOUT';
    } else if (
      status === 503 ||
      status === 404 ||
      errorDetail.includes('Requested function was not found') ||
      errorDetail.includes('not configured') ||
      errorDetail.includes('unavailable')
    ) {
      code = 'LLM_UNAVAILABLE';
    } else if (status === 401 || status === 403) {
      code = 'LLM_REQUEST_FAILED';
    }

    const safeMessage = errorDetail
      .replace(/key=[^&\s]+/gi, 'key=REDACTED')
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer REDACTED');

    return this.buildFailureResponse(code, safeMessage);
  }

  private buildFailureResponse(code: LocalLLMFailureState['code'], message: string): LocalLLMAnalysisResponse {
    return {
      success: false,
      summary: 'Local LLM analysis unavailable. Standard deterministic analytics dashboards remain fully operational.',
      trend: 'INSUFFICIENT_DATA',
      risk_level: 'UNKNOWN',
      insights: [],
      recommendations: [],
      visualizations: [],
      error: {
        code,
        message,
        timestamp: new Date().toISOString(),
      },
    };
  }
}

// Global Singleton Instance export (default configured, enabled can be toggled)
export const localLLMProvider = new DefaultLocalLLMProvider({ enabled: true });
