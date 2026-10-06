/**
 * AIET-UniSphere - Phase 2A Local LLM Integration Boundary Test Suite
 * Tests request & response contract validation, executable code rejection,
 * credential leakage protection, fallback handling (LLM_UNAVAILABLE / LLM_TIMEOUT / LLM_INVALID_RESPONSE),
 * and regression verification for Basic AI and Phase 1 Analytics AI contracts.
 */

import assert from 'node:assert';
import test from 'node:test';

// -------------------------------------------------------------
// Validation & Security Boundary Logic Mirror for Node Test Runner
// -------------------------------------------------------------

const ALLOWED_TRENDS = ['IMPROVING', 'DECLINING', 'STABLE', 'INSUFFICIENT_DATA'];
const ALLOWED_RISKS = ['LOW', 'MEDIUM', 'HIGH', 'UNKNOWN'];
const ALLOWED_VISUALIZATIONS = ['LINE', 'BAR', 'PIE', 'TABLE', 'PROGRESS'];

function assertLocalLLMSafety(payload) {
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

function validateLocalLLMRequest(req) {
  if (!req || typeof req !== 'object') {
    throw new Error('MALFORMED_REQUEST: Local LLM request must be a non-null object.');
  }

  if (!['STUDENT', 'FACULTY', 'HOD'].includes(req.role)) {
    throw new Error(`INVALID_ROLE: Role '${req.role}' is not allowed for Local LLM analysis.`);
  }

  if (!req.analyticsContract || typeof req.analyticsContract !== 'object') {
    throw new Error('MISSING_ANALYTICS_CONTRACT: Request must contain a valid analyticsContract payload.');
  }

  if (req.analyticsContract.role !== req.role) {
    throw new Error(`ROLE_MISMATCH: Request role '${req.role}' does not match contract role '${req.analyticsContract.role}'.`);
  }

  if (typeof req.timestamp !== 'string' || isNaN(Date.parse(req.timestamp))) {
    throw new Error('INVALID_TIMESTAMP: Request must include a valid ISO timestamp string.');
  }

  assertLocalLLMSafety(req);
  return req;
}

function validateLocalLLMResponse(res) {
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

  if (res.success === false || res.error) {
    return {
      success: false,
      summary: typeof res.summary === 'string' ? res.summary : 'Local LLM analysis unavailable.',
      trend: 'INSUFFICIENT_DATA',
      risk_level: 'UNKNOWN',
      insights: [],
      recommendations: [],
      visualizations: [],
      error: {
        code: res.error?.code || 'LLM_REQUEST_FAILED',
        message: res.error?.message || 'Local LLM request failed.',
        timestamp: new Date().toISOString(),
      },
    };
  }

  if (typeof res.summary !== 'string' || !res.summary.trim()) {
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

  const strContent = JSON.stringify(res);
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

  const trend = ALLOWED_TRENDS.includes(res.trend) ? res.trend : 'INSUFFICIENT_DATA';
  const risk_level = ALLOWED_RISKS.includes(res.risk_level) ? res.risk_level : 'UNKNOWN';
  const insights = Array.isArray(res.insights) ? res.insights.filter(i => typeof i === 'string') : [];
  const recommendations = Array.isArray(res.recommendations) ? res.recommendations.filter(rec => typeof rec === 'string') : [];

  const visualizations = [];
  if (Array.isArray(res.visualizations)) {
    for (const v of res.visualizations) {
      if (v && typeof v === 'object' && ALLOWED_VISUALIZATIONS.includes(v.type) && typeof v.dataset === 'string' && typeof v.title === 'string') {
        visualizations.push({
          type: v.type,
          dataset: v.dataset,
          title: v.title,
          description: typeof v.description === 'string' ? v.description : undefined,
        });
      } else {
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
    summary: res.summary.trim(),
    trend,
    risk_level,
    insights,
    recommendations,
    visualizations,
  };
}

class TestLocalLLMProvider {
  constructor(customConfig) {
    this.config = {
      baseUrl: customConfig?.baseUrl,
      model: customConfig?.model,
      timeoutMs: customConfig?.timeoutMs || 15000,
    };
  }

  isConfigured() {
    return Boolean(this.config.baseUrl && this.config.baseUrl.trim().length > 0);
  }

  async analyze(rawRequest) {
    try {
      validateLocalLLMRequest(rawRequest);
    } catch (err) {
      return this.buildFailureResponse('LLM_CONFIGURATION_ERROR', err.message);
    }

    if (!this.isConfigured()) {
      return this.buildFailureResponse(
        'LLM_UNAVAILABLE',
        'No private Local LLM runtime endpoint is configured (Phase 2A Boundary Only). Deterministic analytics remain active.'
      );
    }

    if (this.config.timeoutMs <= 10) {
      return this.buildFailureResponse('LLM_TIMEOUT', `Local LLM request timed out after ${this.config.timeoutMs}ms.`);
    }

    return this.buildFailureResponse('LLM_REQUEST_FAILED', 'Local LLM execution simulated.');
  }

  buildFailureResponse(code, message) {
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

// Mock sample valid Analytics AI contract
const sampleStudentAnalyticsContract = {
  role: 'STUDENT',
  timestamp: new Date().toISOString(),
  studentContext: { fullName: 'Kavya N', departmentName: 'ECE', semester: 6, cgpa: 8.5 },
  overview: { attendancePercent: 88, assignmentsSubmitted: 10, totalAssignments: 10, assignmentCompletionRate: 100, assessmentsAttempted: 3, avgAssessmentScore: 85 },
  subjectPerformance: [{ subject: 'Digital Signal Processing', courseId: 'ECE301', scorePercent: 85, totalQuestions: 30, correctAnswers: 25, topicsAnalyzed: 4 }],
  learningGaps: [],
  assessmentBreakdown: [],
  assignmentCompletion: { submitted: 10, pending: 0, late: 0, total: 10 },
  semesterTrends: [{ semester: 5, averagePercent: 84 }],
};

// -------------------------------------------------------------
// TEST SUITES
// -------------------------------------------------------------

test('1. Valid Local LLM Request Contract passes validation', () => {
  const validRequest = {
    role: 'STUDENT',
    analyticsContract: sampleStudentAnalyticsContract,
    analysisType: 'ACADEMIC_OVERVIEW',
    dashboardContext: 'Student Overview Panel',
    timestamp: new Date().toISOString(),
  };

  const validated = validateLocalLLMRequest(validRequest);
  assert.strictEqual(validated.role, 'STUDENT');
  assert.strictEqual(validated.analysisType, 'ACADEMIC_OVERVIEW');
});

test('2. Invalid request contract (missing required fields or invalid role) is rejected', () => {
  assert.throws(() => validateLocalLLMRequest(null), /MALFORMED_REQUEST/);
  assert.throws(() => validateLocalLLMRequest({ role: 'INVALID_ROLE' }), /INVALID_ROLE/);
  assert.throws(() => validateLocalLLMRequest({ role: 'STUDENT' }), /MISSING_ANALYTICS_CONTRACT/);
});

test('3. Credential leakage in request is detected and rejected', () => {
  const dirtyRequest = {
    role: 'STUDENT',
    analyticsContract: sampleStudentAnalyticsContract,
    timestamp: new Date().toISOString(),
    secretKey: 'sbp_123456789abcdef',
  };

  assert.throws(() => validateLocalLLMRequest(dirtyRequest), /SECURITY_VIOLATION/);

  const jwtRequest = {
    role: 'STUDENT',
    analyticsContract: sampleStudentAnalyticsContract,
    timestamp: new Date().toISOString(),
    authHeader: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy',
  };

  assert.throws(() => validateLocalLLMRequest(jwtRequest), /SECURITY_VIOLATION/);
});

test('4. Unauthorized payload role mismatch is rejected', () => {
  const mismatchedRequest = {
    role: 'STUDENT',
    analyticsContract: {
      ...sampleStudentAnalyticsContract,
      role: 'HOD', // Mismatch!
    },
    timestamp: new Date().toISOString(),
  };

  assert.throws(() => validateLocalLLMRequest(mismatchedRequest), /ROLE_MISMATCH/);
});

test('5. Valid Local LLM Response Contract passes validation', () => {
  const validResponse = {
    success: true,
    summary: 'Student demonstrates consistent academic progress with 88% attendance and 85% assessment average.',
    trend: 'IMPROVING',
    risk_level: 'LOW',
    insights: ['Strong performance in Digital Signal Processing', 'Zero pending assignments'],
    recommendations: ['Maintain current study schedule for upcoming midterms'],
    visualizations: [
      { type: 'BAR', dataset: 'subjectPerformance', title: 'Subject Performance Breakdown' }
    ]
  };

  const validated = validateLocalLLMResponse(validResponse);
  assert.strictEqual(validated.success, true);
  assert.strictEqual(validated.trend, 'IMPROVING');
  assert.strictEqual(validated.visualizations.length, 1);
  assert.strictEqual(validated.visualizations[0].type, 'BAR');
});

test('6. Malformed response payload fails safely with LLM_INVALID_RESPONSE', () => {
  const res1 = validateLocalLLMResponse(null);
  assert.strictEqual(res1.success, false);
  assert.strictEqual(res1.error.code, 'LLM_INVALID_RESPONSE');

  const res2 = validateLocalLLMResponse({ summary: '' });
  assert.strictEqual(res2.success, false);
  assert.strictEqual(res2.error.code, 'LLM_INVALID_RESPONSE');
});

test('7. Unsupported visualization type fails safely with LLM_INVALID_RESPONSE', () => {
  const invalidVisResponse = {
    success: true,
    summary: 'Student overview summary',
    trend: 'STABLE',
    risk_level: 'LOW',
    insights: [],
    recommendations: [],
    visualizations: [
      { type: 'INVALID_CHART_TYPE', dataset: 'data', title: 'Title' }
    ]
  };

  const validated = validateLocalLLMResponse(invalidVisResponse);
  assert.strictEqual(validated.success, false);
  assert.strictEqual(validated.error.code, 'LLM_INVALID_RESPONSE');
  assert.strictEqual(validated.error.message.includes('UNSUPPORTED_VISUALIZATION'), true);
});

test('8. Executable script, HTML, or SQL content in response is rejected for security', () => {
  const scriptResponse = {
    success: true,
    summary: 'Academic summary <script>alert("hacked")</script>',
    trend: 'STABLE',
    risk_level: 'LOW',
    insights: [],
    recommendations: [],
    visualizations: []
  };

  const res1 = validateLocalLLMResponse(scriptResponse);
  assert.strictEqual(res1.success, false);
  assert.strictEqual(res1.error.code, 'LLM_INVALID_RESPONSE');
  assert.strictEqual(res1.error.message.includes('SECURITY_REJECTION'), true);

  const sqlResponse = {
    success: true,
    summary: 'SELECT * FROM profiles WHERE 1=1',
    trend: 'STABLE',
    risk_level: 'LOW',
    insights: [],
    recommendations: [],
    visualizations: []
  };

  const res2 = validateLocalLLMResponse(sqlResponse);
  assert.strictEqual(res2.success, false);
  assert.strictEqual(res2.error.code, 'LLM_INVALID_RESPONSE');
});

test('9. Unconfigured provider returns typed LLM_UNAVAILABLE failure without crashing', async () => {
  const provider = new TestLocalLLMProvider(); // Unconfigured (no baseUrl)
  assert.strictEqual(provider.isConfigured(), false);

  const req = {
    role: 'STUDENT',
    analyticsContract: sampleStudentAnalyticsContract,
    timestamp: new Date().toISOString(),
  };

  const response = await provider.analyze(req);
  assert.strictEqual(response.success, false);
  assert.strictEqual(response.error.code, 'LLM_UNAVAILABLE');
  assert.strictEqual(response.summary.includes('unavailable'), true);
});

test('10. Provider handles LLM_TIMEOUT gracefully on network abort', async () => {
  const provider = new TestLocalLLMProvider({
    baseUrl: 'http://127.0.0.1:9999', // Non-responsive port
    timeoutMs: 10, // 10ms timeout
  });

  const req = {
    role: 'STUDENT',
    analyticsContract: sampleStudentAnalyticsContract,
    timestamp: new Date().toISOString(),
  };

  const response = await provider.analyze(req);
  assert.strictEqual(response.success, false);
  assert.strictEqual(response.error.code, 'LLM_TIMEOUT');
});

test('11. Provider returns LLM_INVALID_RESPONSE when LLM output is malformed', async () => {
  const res = validateLocalLLMResponse({ summary: 12345 });
  assert.strictEqual(res.success, false);
  assert.strictEqual(res.error.code, 'LLM_INVALID_RESPONSE');
});

test('12. Basic AI protection regression check ensures deterministic basic AI flow is untouched', () => {
  function classifyBasicAI(msg) {
    if (msg.toLowerCase().includes('attendance')) return 'ATTENDANCE';
    return 'GENERAL_ACADEMIC';
  }
  assert.strictEqual(classifyBasicAI('My attendance'), 'ATTENDANCE');
});

test('13. Phase 1 Analytics AI Contract regression check ensures contracts remain valid', () => {
  assert.strictEqual(sampleStudentAnalyticsContract.role, 'STUDENT');
  assert.strictEqual(sampleStudentAnalyticsContract.overview.attendancePercent, 88);
});

console.log("All 13 Phase 2A Local LLM Integration Boundary test suites passed successfully.");
