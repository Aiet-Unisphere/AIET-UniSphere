/**
 * AIET-UniSphere Real AI Service
 * Connects to the ai-chat Supabase Edge Function (Gemini/OpenAI backed).
 * Persists conversations and messages to ai_conversations / ai_messages tables.
 * NO AI API keys are ever stored in the browser.
 */
import { supabase } from '../lib/supabase';

// Cast to any for new tables not yet in generated Supabase types
const sb = supabase as any;

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

export interface AIConversation {
  id: string;
  user_id: string;
  title: string;
  course_context: string | null;
  created_at: string;
  updated_at: string;
}

export interface AIMessage {
  id: string;
  conversation_id: string;
  user_id: string;
  sender: 'user' | 'ai';
  content: string;
  tokens_used?: number | null;
  created_at: string;
}

export interface QuickActionItem {
  id: string;
  label: string;
  prompt: string;
  icon: string;
}

export interface DocumentCitation {
  documentId: string;
  title: string;
  documentType: string;
  version: string;
  pageNumber?: number;
  sectionTitle?: string;
}

export interface SendMessageResult {
  conversationId: string;
  reply: string;
  provider?: string;
  tokensUsed?: number;
  citations?: DocumentCitation[];
}

// ---------------------------------------------------------------------------
// QUICK ACTIONS (Static, no DB needed)
// ---------------------------------------------------------------------------

export const QUICK_ACTIONS: QuickActionItem[] = [
  // Phase 1: Internal database query actions
  { id: 'qa1', label: 'My Attendance', prompt: 'What is my current attendance percentage? Show me my attendance details.', icon: 'bar-chart-2' },
  { id: 'qa2', label: 'My Assignments', prompt: 'Show me my pending assignments and their deadlines.', icon: 'clipboard-check' },
  { id: 'qa3', label: 'My Leave Status', prompt: 'Show me my leave requests and their current status.', icon: 'calendar-off' },
  { id: 'qa4', label: 'My Notifications', prompt: 'Show me my recent notifications and announcements.', icon: 'bell' },
  { id: 'qa5', label: 'VTU Exam Rules', prompt: 'What are the official VTU rules and minimum attendance requirements for appearing in university exams?', icon: 'file-text' },
  { id: 'qa6', label: 'Academic Calendar', prompt: 'What are the important dates and events in the academic calendar?', icon: 'calendar' },
];

// ---------------------------------------------------------------------------
// GET CONVERSATIONS
// ---------------------------------------------------------------------------

export const getConversations = async (): Promise<AIConversation[]> => {
  const { data, error } = await sb
    .from('ai_conversations')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('[aiService] getConversations error:', error.message);
    return [];
  }
  return (data || []) as AIConversation[];
};

// ---------------------------------------------------------------------------
// GET MESSAGES FOR A CONVERSATION
// ---------------------------------------------------------------------------

export const getConversationMessages = async (conversationId: string): Promise<AIMessage[]> => {
  const { data, error } = await sb
    .from('ai_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[aiService] getConversationMessages error:', error.message);
    return [];
  }
  return (data || []) as AIMessage[];
};

// ---------------------------------------------------------------------------
// SEND MESSAGE (calls Edge Function)
// ---------------------------------------------------------------------------

// Helper to parse safe error message from Edge Function invocation
async function parseFunctionsError(error: any): Promise<string> {
  let errorDetail = error.message || 'AI service error';
  if (error.context && typeof error.context.json === 'function') {
    try {
      const errorJson = await error.context.json();
      errorDetail = errorJson?.error || errorJson?.message || errorDetail;
    } catch {
      // context was not json
    }
  }

  const status = error.context?.status;
  if (status === 404 || errorDetail.includes('Requested function was not found')) {
    return "The 'ai-chat' Edge Function is not deployed to Supabase. Deploy it using `npx supabase functions deploy ai-chat`.";
  }
  if (status === 401 || errorDetail.includes('Unauthorized') || errorDetail.includes('Authentication required')) {
    return "Your session has expired. Please sign in again.";
  }
  if (status === 403 || errorDetail.includes('active account is required')) {
    return "Your account is not currently active to use the AI Assistant. Please contact an administrator.";
  }
  if (status === 429 || errorDetail.includes('rate limit')) {
    return "AI request limit reached. Please wait a moment before trying again.";
  }
  if (status === 413 || errorDetail.includes('character limit')) {
    return "Your message exceeds the 4000 character limit.";
  }

  // Sanitize any API key or bearer token leaks
  return errorDetail
    .replace(/key=[^&\s]+/gi, "key=REDACTED")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer REDACTED");
}

export function normalizeCourseContext(context?: string | null): string | null {
  if (!context || typeof context !== 'string') return null;
  const trimmed = context.trim();
  if (trimmed === '' || trimmed.toLowerCase() === 'all' || trimmed === 'All Courses') {
    return null;
  }
  return trimmed;
}

export const sendMessage = async (
  message: string,
  conversationId: string | null,
  courseContext?: string | null,
  history: Array<{ role: string; content: string }> = []
): Promise<SendMessageResult> => {
  // Get current session for auth header
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session) {
    throw new Error('Your session has expired. Please sign in again.');
  }

  const normalizedContext = normalizeCourseContext(courseContext);

  try {
    const { data, error } = await supabase.functions.invoke('ai-chat', {
      body: {
        message: message.trim(),
        conversationId: conversationId || undefined,
        courseContext: normalizedContext,
        courseContextId: normalizedContext,
        conversationHistory: history,
      },
    });

    if (error) {
      const safeErrorMsg = await parseFunctionsError(error);
      throw new Error(safeErrorMsg);
    }

    if (!data) {
      throw new Error('The AI assistant returned an empty response. Please try again.');
    }

    if (data.success === false) {
      throw new Error(data.error || 'The AI service encountered an error.');
    }

    return {
      conversationId: data.conversationId,
      reply: data.reply || data.message || '',
      provider: data.provider,
      tokensUsed: data.tokensUsed || data.usage?.totalTokens,
      citations: data.citations || undefined,
    };
  } catch (err: unknown) {
    if (err instanceof Error) {
      const sanitized = err.message
        .replace(/key=[^&\s]+/gi, "key=REDACTED")
        .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer REDACTED");
      throw new Error(sanitized);
    }
    throw new Error('The AI assistant is temporarily unavailable. Please try again.');
  }
};

// ---------------------------------------------------------------------------
// DELETE CONVERSATION
// ---------------------------------------------------------------------------

export const deleteConversation = async (conversationId: string): Promise<void> => {
  const { error } = await sb
    .from('ai_conversations')
    .delete()
    .eq('id', conversationId);

  if (error) {
    throw new Error(`Failed to delete conversation: ${error.message}`);
  }
};

// ---------------------------------------------------------------------------
// CREATE CONVERSATION (for pre-creating before first message)
// ---------------------------------------------------------------------------

export const createConversation = async (
  title: string,
  courseContext?: string
): Promise<AIConversation> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Authentication required.');

  const { data, error } = await sb
    .from('ai_conversations')
    .insert({
      user_id: user.id,
      title: title.substring(0, 80),
      course_context: courseContext || null,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create conversation: ${error.message}`);
  return data as AIConversation;
};

export const FACULTY_QUICK_ACTIONS: QuickActionItem[] = [
  { id: 'qa_f1', label: 'My Courses', prompt: 'Show me my assigned teaching courses and schedules.', icon: 'book-open' },
  { id: 'qa_f2', label: 'Attendance Overview', prompt: 'Show attendance overview for my teaching courses and identify students with attendance shortages.', icon: 'bar-chart-2' },
  { id: 'qa_f3', label: 'Pending Evaluations', prompt: 'Show assignments and assessments pending evaluation in my courses.', icon: 'clipboard-check' },
  { id: 'qa_f4', label: 'Class Announcements', prompt: 'Help me prepare an announcement for my classes.', icon: 'megaphone' },
  { id: 'qa_f5', label: 'VTU Exam Rules', prompt: 'What are the official VTU exam regulations and attendance requirements?', icon: 'file-text' },
  { id: 'qa_f6', label: 'Academic Calendar', prompt: 'What are the upcoming academic calendar events and submission deadlines?', icon: 'calendar' },
];

export const HOD_QUICK_ACTIONS: QuickActionItem[] = [
  { id: 'qa_h1', label: 'Department Overview', prompt: 'Give me a department academic summary and active statistics.', icon: 'building-2' },
  { id: 'qa_h2', label: 'Faculty Assignments', prompt: 'Show faculty teaching assignments and course distribution in my department.', icon: 'users' },
  { id: 'qa_h3', label: 'Department Attendance', prompt: 'Give me a department attendance summary and list classes with shortage concerns.', icon: 'bar-chart-2' },
  { id: 'qa_h4', label: 'Leave Requests', prompt: 'Show leave requests awaiting review in my department.', icon: 'file-check' },
  { id: 'qa_h5', label: 'Institutional Policies', prompt: 'Explain the institutional policies and academic regulations relevant to my department.', icon: 'file-text' },
  { id: 'qa_h6', label: 'Academic Calendar', prompt: 'Show upcoming department academic deadlines and exam schedules.', icon: 'calendar' },
];

// ---------------------------------------------------------------------------
// QUICK ACTIONS GETTER (Role aware)
// ---------------------------------------------------------------------------

export const getQuickActions = async (role?: string): Promise<QuickActionItem[]> => {
  if (role === 'FACULTY') return FACULTY_QUICK_ACTIONS;
  if (role === 'HOD') return HOD_QUICK_ACTIONS;
  return QUICK_ACTIONS;
};
