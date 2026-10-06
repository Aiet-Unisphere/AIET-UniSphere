import React, { useState } from 'react';
import { Send, Loader2 } from 'lucide-react';

interface AIInputProps {
  onSendMessage: (text: string) => void;
  isLoading?: boolean;
  placeholder?: string;
}

export const AIInput: React.FC<AIInputProps> = ({ 
  onSendMessage, 
  isLoading = false,
  placeholder = "Ask about your courses, assignments, DBMS, OS, or exam prep..." 
}) => {
  const [text, setText] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || isLoading) return;
    onSendMessage(text.trim());
    setText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form className="ai-input-form" onSubmit={handleSubmit}>
      <div className="ai-input-container">
        <textarea
          className="ai-textarea font-sans"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={2}
          disabled={isLoading}
        />
        
        <button
          type="submit"
          className="btn btn-primary ai-send-btn"
          disabled={!text.trim() || isLoading}
          title="Send message"
        >
          {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          <span className="hidden-mobile">Send</span>
        </button>
      </div>
      
    </form>
  );
};
