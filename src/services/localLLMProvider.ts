/**
 * AIET-UniSphere - Provider-Neutral Local LLM Abstraction & Boundary Adapter
 * 
 * ARCHITECTURAL & SECURITY RULES:
 * 1. This abstraction decouples UniSphere from specific runtimes (Ollama, vLLM, LocalAI, TGI).
 * 2. It accepts ONLY authorized, pre-validated Analytics AI Contracts.
 * 3. It DOES NOT execute models or external cloud API calls in Phase 2A.
 * 4. When no local runtime is configured, it fails safely with 'LLM_UNAVAILABLE' without
 *    disrupting Basic AI or deterministic analytics dashboards.
 */

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
   * Returns true if a local model endpoint is actively configured.
   */
  isConfigured(): boolean;

  /**
   * Returns current sanitized runtime configuration.
   */
  getConfig(): LocalLLMConfig;
}

/**
 * Default Provider-Neutral Local LLM Boundary Adapter
 */
export class DefaultLocalLLMProvider implements ILocalLLMProvider {
  private config: LocalLLMConfig;

  constructor(customConfig?: LocalLLMConfig) {
    const env = typeof globalThis !== 'undefined' ? (globalThis as any).process?.env : {};
    this.config = {
      baseUrl: customConfig?.baseUrl || env?.LOCAL_LLM_BASE_URL,
      model: customConfig?.model || env?.LOCAL_LLM_MODEL,
      timeoutMs: customConfig?.timeoutMs || 15000,
      maxTokens: customConfig?.maxTokens || 2048,
      temperature: customConfig?.temperature || 0.2,
    };
  }

  public isConfigured(): boolean {
    return Boolean(this.config.baseUrl && this.config.baseUrl.trim().length > 0);
  }

  public getConfig(): LocalLLMConfig {
    return {
      baseUrl: this.config.baseUrl ? 'CONFIGURED_PRIVATE_ENDPOINT' : undefined,
      model: this.config.model || 'UNCONFIGURED',
      timeoutMs: this.config.timeoutMs,
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature,
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

    // 2. Check if Local LLM endpoint is configured
    if (!this.isConfigured()) {
      return this.buildFailureResponse(
        'LLM_UNAVAILABLE',
        'No private Local LLM runtime endpoint is configured (Phase 2A Boundary Only). Deterministic analytics remain active.'
      );
    }

    // 3. Server-side / Edge Function dispatch (To be executed when Local LLM container is stood up)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs || 15000);

      const endpoint = `${this.config.baseUrl!.replace(/\/+$/, '')}/v1/chat/completions`;

      const httpResponse = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.model || 'local-model',
          messages: [
            {
              role: 'system',
              content: 'You are UniSphere Local Analytics AI. Analyze the structured contract JSON and return strict JSON with summary, trend, risk_level, insights, recommendations, visualizations.',
            },
            {
              role: 'user',
              content: JSON.stringify(validatedReq),
            },
          ],
          temperature: this.config.temperature,
          max_tokens: this.config.maxTokens,
        }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      if (!httpResponse.ok) {
        return this.buildFailureResponse('LLM_REQUEST_FAILED', `Local LLM endpoint returned HTTP status ${httpResponse.status}.`);
      }

      const json = await httpResponse.json();
      const rawContent = json?.choices?.[0]?.message?.content;
      if (!rawContent) {
        return this.buildFailureResponse('LLM_INVALID_RESPONSE', 'Local LLM returned empty candidate response.');
      }

      const parsed = JSON.parse(rawContent);
      return validateLocalLLMResponse(parsed);

    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        return this.buildFailureResponse('LLM_TIMEOUT', `Local LLM request timed out after ${this.config.timeoutMs}ms.`);
      }
      const msg = err instanceof Error ? err.message : 'Network error communicating with Local LLM endpoint.';
      return this.buildFailureResponse('LLM_REQUEST_FAILED', msg);
    }
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

// Global Singleton Instance export
export const localLLMProvider = new DefaultLocalLLMProvider();
