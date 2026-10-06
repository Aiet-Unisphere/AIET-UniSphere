import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Sparkles, MessageSquare, RotateCcw, Trash2, AlertCircle, RefreshCw, Building2, UserCheck } from 'lucide-react';
import { HODAppShell } from '../components/HODAppShell';
import { LoadingState } from '../../components/LoadingState';
import { AIMessage } from '../../components/AIMessage';
import { AIInput } from '../../components/AIInput';
import { AIQuickAction } from '../../components/AIQuickAction';
import { ConversationList } from '../../components/ConversationList';
import { CourseContextSelector } from '../../components/CourseContextSelector';
import { useAuth } from '../../app/context/AuthContext';
import {
  getConversations,
  getConversationMessages,
  getQuickActions,
  sendMessage,
  deleteConversation,
  type AIConversation,
  type AIMessage as AIMessageType,
  type QuickActionItem,
} from '../../services/aiService';

export const HODAIAssistantPage: React.FC = () => {
  const { profile, user } = useAuth();
  const [searchParams] = useSearchParams();
  const initialPrompt = searchParams.get('prompt');

  const hodName = profile?.full_name || user?.email?.split('@')[0] || 'Head of Department';
  const deptName = profile?.department?.name || 'Department';
  const deptCode = profile?.department?.code || '';

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
        const [convList, qActions] = await Promise.all([
          getConversations(),
          getQuickActions('HOD'),
        ]);

        setConversations(convList);
        setQuickActions(qActions);

        if (convList.length > 0) {
          setActiveConvId(convList[0].id);
          const convMessages = await getConversationMessages(convList[0].id);
          setMessages(convMessages);
          setCourseContext(convList[0].course_context || 'All Courses');
        }
      } catch (err) {
        console.error('[HODAIPage] loadData error:', err);
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

      const updatedConvs = await getConversations();
      setConversations(updatedConvs);
      setActiveConvId(result.conversationId);

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
      console.error('[HODAIPage] deleteConversation error:', err);
    }
  }, [activeConvId, handleSelectConversation, handleNewConversation]);

  const adaptedConversations = conversations.map(conv => ({
    id: conv.id,
    title: conv.title,
    date: new Date(conv.updated_at).toLocaleDateString(),
    courseContext: conv.course_context || 'All Courses',
    messages: [],
  }));

  return (
    <HODAppShell>
      {/* Page Header */}
      <div className="page-header-container" style={{ marginBottom: '1.25rem' }}>
        <div>
          <div className="breadcrumbs">
            <span>Department Head Portal</span>
            <span className="breadcrumbs-separator">/</span>
            <span style={{ fontWeight: 600, color: 'var(--brand-black)' }}>AI Assistant</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginTop: '0.25rem' }}>
            <Sparkles size={24} className="text-orange" />
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700 }}>Department Head AI Assistant</h1>
            <span className="badge badge-active font-mono" style={{ fontSize: '0.7rem' }}>Department Intelligence</span>
          </div>
          <p style={{ fontSize: '0.875rem', color: 'var(--brand-dark-grey)', marginTop: '0.25rem' }}>
            How can I help manage your department? Ask about department academics, faculty assignments, student attendance analytics, or institutional policies.
          </p>
        </div>

        {/* Authenticated Identity Pill */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.5rem 0.85rem',
          backgroundColor: 'var(--brand-white)',
          borderRadius: 'var(--border-radius)',
          border: '1px solid rgba(156, 163, 175, 0.2)',
          fontSize: '0.8rem',
          color: 'var(--brand-black)'
        }}>
          <Building2 size={16} className="text-orange" />
          <div>
            <div style={{ fontWeight: 600 }}>{hodName}</div>
            <div style={{ fontSize: '0.725rem', color: 'var(--brand-dark-grey)' }}>
              Head of Department · {deptName} {deptCode ? `[${deptCode}]` : ''}
            </div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <LoadingState message="Connecting to Department Head AI assistant..." />
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
                  <h2 className="ai-landing-title font-display">Department Governance AI</h2>
                  <p className="ai-landing-subtitle">
                    How can I help manage your department today? Ask about faculty course assignments, department attendance trends, pending leave approvals, or academic regulations.
                  </p>

                  {sendError && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.5rem',
                      padding: '0.75rem 1rem',
                      backgroundColor: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid var(--brand-danger)',
                      borderRadius: 'var(--border-radius)',
                      color: 'var(--brand-danger)',
                      fontSize: '0.85rem',
                      margin: '1rem 0'
                    }}>
                      <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                      <div style={{ flex: 1 }}>
                        <strong>Error:</strong> {sendError}
                        {lastFailedMessage && (
                          <div style={{ marginTop: '0.5rem' }}>
                            <button
                              className="btn btn-secondary"
                              onClick={() => handleSendMessage(lastFailedMessage, true)}
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', width: 'auto' }}
                            >
                              <RefreshCw size={12} />
                              <span>Retry Message</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <AIQuickAction
                    quickActions={quickActions}
                    onSelectAction={(prompt) => handleSendMessage(prompt)}
                  />
                </div>
              ) : (
                /* Chat Messages */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
                    <div className="ai-typing-indicator">
                      <Sparkles size={16} className="text-orange animate-spin" />
                      <span>HOD Department AI is gathering analytics and policy context...</span>
                    </div>
                  )}

                  {sendError && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.5rem',
                      padding: '0.75rem 1rem',
                      backgroundColor: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid var(--brand-danger)',
                      borderRadius: 'var(--border-radius)',
                      color: 'var(--brand-danger)',
                      fontSize: '0.85rem',
                      margin: '0.5rem 0'
                    }}>
                      <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                      <div style={{ flex: 1 }}>
                        <strong>Error:</strong> {sendError}
                        {lastFailedMessage && (
                          <div style={{ marginTop: '0.5rem' }}>
                            <button
                              className="btn btn-secondary"
                              onClick={() => handleSendMessage(lastFailedMessage, true)}
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', width: 'auto' }}
                            >
                              <RefreshCw size={12} />
                              <span>Retry Message</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Input Bar */}
            <AIInput
              onSendMessage={(text) => handleSendMessage(text)}
              isLoading={isSending}
              placeholder="Ask about department academics, faculty assignments, attendance analytics, or institutional policies..."
            />
          </div>
        </div>
      )}
    </HODAppShell>
  );
};

export default HODAIAssistantPage;
