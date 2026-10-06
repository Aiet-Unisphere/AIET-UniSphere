import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Sparkles, MessageSquare, RotateCcw, Trash2, AlertCircle, RefreshCw } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { LoadingState } from '../components/LoadingState';
import { AIMessage } from '../components/AIMessage';
import { AIInput } from '../components/AIInput';
import { AIQuickAction } from '../components/AIQuickAction';
import { ConversationList } from '../components/ConversationList';
import { CourseContextSelector } from '../components/CourseContextSelector';
import {
  getConversations,
  getConversationMessages,
  getQuickActions,
  sendMessage,
  deleteConversation,
  type AIConversation,
  type AIMessage as AIMessageType,
  type QuickActionItem,
} from '../services/aiService';
import { getStudentEnrollments } from '../services/courseEnrollmentService';

export const AILearningAssistantPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const initialPrompt = searchParams.get('prompt');

  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AIMessageType[]>([]);
  const [quickActions, setQuickActions] = useState<QuickActionItem[]>([]);
  const [courseContexts, setCourseContexts] = useState<string[]>(['All Courses']);
  const [courseContext, setCourseContext] = useState<string>('All Courses');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null);
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const didAutoSend = useRef(false);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const [convList, qActions, enrollments] = await Promise.all([
          getConversations(),
          getQuickActions(),
          getStudentEnrollments(),
        ]);

        setConversations(convList);
        setQuickActions(qActions);

        const contexts = ['All Courses', ...enrollments.map(e => e.course_name)];
        setCourseContexts([...new Set(contexts)]);

        if (convList.length > 0) {
          setActiveConvId(convList[0].id);
          const convMessages = await getConversationMessages(convList[0].id);
          setMessages(convMessages);
          setCourseContext(convList[0].course_context || 'All Courses');
        }
      } catch (err) {
        console.error('[AIPage] loadData error:', err);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  // Auto-send initial prompt from URL parameter
  useEffect(() => {
    if (initialPrompt && !isLoading && !didAutoSend.current) {
      didAutoSend.current = true;
      handleSendMessage(initialPrompt);
    }
  }, [initialPrompt, isLoading]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSelectConversation = useCallback(async (id: string) => {
    setActiveConvId(id);
    setSendError(null);
    const selected = conversations.find(c => c.id === id);
    if (selected) {
      setCourseContext(selected.course_context || 'All Courses');
    }
    const convMessages = await getConversationMessages(id);
    setMessages(convMessages);
    setIsHistoryDrawerOpen(false);
  }, [conversations]);

  const handleNewConversation = useCallback(() => {
    setActiveConvId(null);
    setMessages([]);
    setSendError(null);
    setIsHistoryDrawerOpen(false);
  }, []);

  const handleSendMessage = useCallback(async (text: string, isRetry: boolean = false) => {
    if (!text.trim() || isSending) return;
    setSendError(null);
    setIsSending(true);

    const tempUserMsgId = `temp-user-${Date.now()}`;
    let currentMessages = messages;

    // Optimistically add user message if this is a new send (not a retry)
    if (!isRetry) {
      const tempUserMsg: AIMessageType = {
        id: tempUserMsgId,
        conversation_id: activeConvId || 'new',
        user_id: '',
        sender: 'user',
        content: text,
        created_at: new Date().toISOString(),
      };
      currentMessages = [...messages, tempUserMsg];
      setMessages(currentMessages);
    }

    try {
      // Build history from current messages (excluding newest message being processed)
      const history = currentMessages
        .slice(0, isRetry ? undefined : -1)
        .slice(-10)
        .map(m => ({
          role: m.sender,
          content: m.content,
        }));

      const result = await sendMessage(
        text,
        activeConvId,
        courseContext,
        history
      );

      setLastFailedMessage(null);

      // Update conversation list
      const updatedConvs = await getConversations();
      setConversations(updatedConvs);
      setActiveConvId(result.conversationId);

      // Replace with fresh messages from server
      const freshMessages = await getConversationMessages(result.conversationId);
      if (freshMessages.length > 0) {
        setMessages(freshMessages);
      } else {
        const aiMsg: AIMessageType = {
          id: `temp-ai-${Date.now()}`,
          conversation_id: result.conversationId,
          user_id: '',
          sender: 'ai',
          content: result.reply,
          tokens_used: result.tokensUsed,
          created_at: new Date().toISOString(),
        };
        setMessages([...currentMessages, aiMsg]);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Failed to get AI response. Please try again.';
      setSendError(errMsg);
      setLastFailedMessage(text);
      // DO NOT REMOVE THE USER'S MESSAGE ON ERROR.
      // Keeping the message in currentMessages preserves the conversation view and prevents resetting to the landing screen.
    } finally {
      setIsSending(false);
    }
  }, [activeConvId, courseContext, isSending, messages]);

  const handleDeleteConversation = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteConversation(id);
      const updated = await getConversations();
      setConversations(updated);
      if (activeConvId === id) {
        if (updated.length > 0) {
          await handleSelectConversation(updated[0].id);
        } else {
          handleNewConversation();
        }
      }
    } catch (err) {
      console.error('[AIPage] deleteConversation error:', err);
    }
  }, [activeConvId, handleSelectConversation, handleNewConversation]);

  // Adapt conversation list for ConversationList component format
  const adaptedConversations = conversations.map(conv => ({
    id: conv.id,
    title: conv.title,
    date: new Date(conv.updated_at).toLocaleDateString(),
    courseContext: conv.course_context || 'All Courses',
    messages: [], // messages loaded separately
  }));

  return (
    <AppShell>
      {/* Header */}
      <div className="page-header-container" style={{ marginBottom: '1rem' }}>
        <div>
          <div className="breadcrumbs">
            <span>Intelligence</span>
            <span className="breadcrumbs-separator">/</span>
            <span style={{ fontWeight: 600, color: 'var(--brand-black)' }}>AI Learning Assistant</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
            <Sparkles size={24} className="text-orange" />
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700 }}>AIET-UniSphere AI</h1>
            <span className="badge badge-active font-mono" style={{ fontSize: '0.7rem' }}>Internal AI</span>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--brand-dark-grey)', marginTop: '0.125rem' }}>
            Your personalized AI learning assistant. Ask course questions, generate quizzes, or plan your study schedule.
          </p>
        </div>

        <button
          className="btn btn-secondary visible-mobile"
          onClick={() => setIsHistoryDrawerOpen(!isHistoryDrawerOpen)}
          style={{ width: 'auto', padding: '0.5rem 0.75rem' }}
        >
          <MessageSquare size={16} />
          <span>History</span>
        </button>
      </div>

      {isLoading ? (
        <LoadingState message="Connecting to AIET-UniSphere AI assistant..." />
      ) : (
        <div className="ai-interface-grid">
          {/* Left Panel: Conversation History */}
          <div className={`ai-sidebar-column ${isHistoryDrawerOpen ? 'drawer-open' : ''}`}>
            <ConversationList
              conversations={adaptedConversations}
              activeConversationId={activeConvId}
              onSelectConversation={handleSelectConversation}
              onNewConversation={handleNewConversation}
              onClearConversation={handleDeleteConversation}
            />
          </div>

          {/* Main Chat Area */}
          <div className="ai-chat-main-column">
            {/* Top Toolbar */}
            <div className="ai-chat-toolbar-bar">
              <CourseContextSelector
                contexts={courseContexts}
                selectedContext={courseContext}
                onSelectContext={setCourseContext}
              />

              {activeConvId && (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    className="btn btn-secondary"
                    style={{ width: 'auto', padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                    onClick={handleNewConversation}
                  >
                    <RotateCcw size={13} />
                    <span>Start Fresh</span>
                  </button>
                  <button
                    className="btn btn-secondary"
                    style={{ width: 'auto', padding: '0.35rem 0.65rem', fontSize: '0.75rem', color: 'var(--brand-danger)' }}
                    onClick={(e) => handleDeleteConversation(activeConvId, e)}
                    title="Delete this conversation"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </div>

            {/* Chat Body */}
            <div className="ai-messages-scroll-box">
              {messages.length === 0 ? (
                /* Landing Experience */
                <div className="ai-landing-experience">
                  <div className="ai-landing-icon-badge">
                    <Sparkles size={32} className="text-orange" />
                  </div>
                  <h2 className="ai-landing-title font-display">AIET-UniSphere AI</h2>
                  <p className="ai-landing-subtitle">
                    How can I help you learn today? Select a course context or choose a quick action below to start learning.
                  </p>

                  {sendError && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.5rem',
                      padding: '0.75rem 1rem',
                      backgroundColor: 'rgba(239, 68, 68, 0.08)',
                      border: '1px solid rgba(239, 68, 68, 0.2)',
                      borderRadius: '0.5rem',
                      margin: '1rem 0',
                      textAlign: 'left',
                      width: '100%',
                      maxWidth: '600px',
                    }}>
                      <AlertCircle size={16} color="var(--brand-danger, #ef4444)" style={{ flexShrink: 0, marginTop: '0.1rem' }} />
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: '0.85rem', color: 'var(--brand-danger, #ef4444)', margin: 0 }}>{sendError}</p>
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                          {lastFailedMessage && (
                            <button
                              className="btn btn-primary"
                              style={{ padding: '0.25rem 0.65rem', fontSize: '0.75rem', width: 'auto' }}
                              onClick={() => {
                                const msg = lastFailedMessage;
                                setSendError(null);
                                handleSendMessage(msg, true);
                              }}
                            >
                              <RotateCcw size={12} />
                              <span>Retry</span>
                            </button>
                          )}
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '0.25rem 0.65rem', fontSize: '0.75rem', width: 'auto' }}
                            onClick={() => {
                              setSendError(null);
                              setLastFailedMessage(null);
                            }}
                          >
                            <RefreshCw size={12} />
                            <span>Dismiss</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <AIQuickAction
                    quickActions={quickActions}
                    onSelectAction={(prompt) => handleSendMessage(prompt, false)}
                  />
                </div>
              ) : (
                /* Conversation Messages */
                <div className="ai-messages-list">
                  {messages.map((msg) => (
                    <AIMessage
                      key={msg.id}
                      message={{
                        id: msg.id,
                        sender: msg.sender,
                        text: msg.content,
                        timestamp: new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                      }}
                    />
                  ))}
                  {isSending && (
                    <div className="ai-typing-indicator font-mono">
                      <Sparkles size={14} className="text-orange animate-spin" />
                      <span>AIET-UniSphere AI is generating response...</span>
                    </div>
                  )}
                  {sendError && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.5rem',
                      padding: '0.75rem 1rem',
                      backgroundColor: 'rgba(239, 68, 68, 0.08)',
                      border: '1px solid rgba(239, 68, 68, 0.2)',
                      borderRadius: '0.5rem',
                      margin: '0.5rem 0',
                    }}>
                      <AlertCircle size={16} color="var(--brand-danger, #ef4444)" style={{ flexShrink: 0, marginTop: '0.1rem' }} />
                      <div>
                        <p style={{ fontSize: '0.85rem', color: 'var(--brand-danger, #ef4444)', margin: 0 }}>{sendError}</p>
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                          {lastFailedMessage && (
                            <button
                              className="btn btn-primary"
                              style={{ padding: '0.25rem 0.65rem', fontSize: '0.75rem', width: 'auto' }}
                              onClick={() => {
                                const msg = lastFailedMessage;
                                setSendError(null);
                                handleSendMessage(msg, true);
                              }}
                            >
                              <RotateCcw size={12} />
                              <span>Retry</span>
                            </button>
                          )}
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '0.25rem 0.65rem', fontSize: '0.75rem', width: 'auto' }}
                            onClick={() => {
                              setSendError(null);
                              setLastFailedMessage(null);
                            }}
                          >
                            <RefreshCw size={12} />
                            <span>Dismiss</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Bottom Input Bar */}
            <div className="ai-chat-bottom-bar">
              <AIInput
                onSendMessage={handleSendMessage}
                isLoading={isSending}
              />
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
};

export default AILearningAssistantPage;
