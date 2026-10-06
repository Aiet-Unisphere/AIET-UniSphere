import React from 'react';
import { User, Sparkles } from 'lucide-react';
import type { AIMessageItem } from '../data/aiConversations';

interface AIMessageProps {
  message: AIMessageItem;
}

interface Block {
  type: 'header' | 'bullet_list' | 'ordered_list' | 'code_block' | 'paragraph';
  level?: number;
  items?: string[];
  content?: string;
}

/**
 * Formats inline Markdown elements like **bold**, *italic*, `code`, and preserves emojis.
 */
function renderInlineMarkdown(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const inlineRegex = /(\*\*(?:[^*]|\*[^*])+\*\*|\*(?:[^*]|\*\*[^*]+\*\*)+\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  while ((match = inlineRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }

    const matchedStr = match[0];
    if (matchedStr.startsWith('**') && matchedStr.endsWith('**')) {
      parts.push(
        <strong key={`bold-${keyIdx++}`} style={{ fontWeight: 600 }}>
          {renderInlineMarkdown(matchedStr.slice(2, -2))}
        </strong>
      );
    } else if (matchedStr.startsWith('*') && matchedStr.endsWith('*')) {
      parts.push(
        <em key={`em-${keyIdx++}`} style={{ fontStyle: 'italic' }}>
          {renderInlineMarkdown(matchedStr.slice(1, -1))}
        </em>
      );
    } else if (matchedStr.startsWith('`') && matchedStr.endsWith('`')) {
      parts.push(
        <code
          key={`code-${keyIdx++}`}
          className="font-mono"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.06)',
            padding: '0.1rem 0.35rem',
            borderRadius: '0.25rem',
            fontSize: '0.85em',
          }}
        >
          {matchedStr.slice(1, -1)}
        </code>
      );
    }

    lastIndex = inlineRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts;
}

/**
 * Parses raw message text into structured Markdown blocks (headers, lists, paragraphs, code blocks).
 */
function parseMarkdownBlocks(text: string): Block[] {
  const lines = text.split(/\r?\n/);
  const blocks: Block[] = [];
  let currentBlock: Block | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      if (currentBlock) {
        blocks.push(currentBlock);
        currentBlock = null;
      }
      continue;
    }

    // Code block check (```)
    if (trimmed.startsWith('```')) {
      if (currentBlock && currentBlock.type === 'code_block') {
        blocks.push(currentBlock);
        currentBlock = null;
      } else {
        if (currentBlock) blocks.push(currentBlock);
        currentBlock = { type: 'code_block', content: '' };
      }
      continue;
    }

    if (currentBlock && currentBlock.type === 'code_block') {
      currentBlock.content += (currentBlock.content ? '\n' : '') + line;
      continue;
    }

    // Header check (### Header, ## Header, # Header)
    const headerMatch = trimmed.match(/^(#{1,6})\s+(.+)/);
    if (headerMatch) {
      if (currentBlock) blocks.push(currentBlock);
      blocks.push({
        type: 'header',
        level: headerMatch[1].length,
        content: headerMatch[2],
      });
      currentBlock = null;
      continue;
    }

    // Bullet list check (- item, * item, • item)
    const bulletMatch = trimmed.match(/^([-*•])\s+(.+)/);
    if (bulletMatch) {
      if (currentBlock && currentBlock.type === 'bullet_list') {
        currentBlock.items!.push(bulletMatch[2]);
      } else {
        if (currentBlock) blocks.push(currentBlock);
        currentBlock = {
          type: 'bullet_list',
          items: [bulletMatch[2]],
        };
      }
      continue;
    }

    // Ordered list check (1. item, 2. item, etc.)
    const orderedMatch = trimmed.match(/^(\d+)\.\s+(.+)/);
    if (orderedMatch) {
      if (currentBlock && currentBlock.type === 'ordered_list') {
        currentBlock.items!.push(orderedMatch[2]);
      } else {
        if (currentBlock) blocks.push(currentBlock);
        currentBlock = {
          type: 'ordered_list',
          items: [orderedMatch[2]],
        };
      }
      continue;
    }

    // Paragraph line
    if (currentBlock && currentBlock.type === 'paragraph') {
      currentBlock.content += ' ' + trimmed;
    } else {
      if (currentBlock) blocks.push(currentBlock);
      currentBlock = {
        type: 'paragraph',
        content: trimmed,
      };
    }
  }

  if (currentBlock) {
    blocks.push(currentBlock);
  }

  return blocks;
}

function renderListItemContent(item: string, isAI: boolean): React.ReactNode {
  const parentheticalMatch = item.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (parentheticalMatch && parentheticalMatch[1].trim()) {
    const mainText = parentheticalMatch[1].trim();
    const subDetail = parentheticalMatch[2].trim();
    return (
      <>
        <span>{renderInlineMarkdown(mainText)}</span>
        <span
          style={{
            display: 'block',
            fontSize: '0.86em',
            color: isAI ? 'var(--brand-dark-grey, #555555)' : 'rgba(255, 255, 255, 0.85)',
            marginTop: '0.15rem',
            paddingLeft: '0.1rem',
            fontWeight: 400,
          }}
        >
          {renderInlineMarkdown(subDetail)}
        </span>
      </>
    );
  }

  return renderInlineMarkdown(item);
}

export const AIMessage: React.FC<AIMessageProps> = ({ message }) => {
  const isAI = message.sender === 'ai';
  const blocks = parseMarkdownBlocks(message.text);

  return (
    <div className={`ai-message-row ${isAI ? 'ai-sender' : 'user-sender'}`}>
      <div className={`ai-avatar-circle ${isAI ? 'ai-icon-bg' : 'user-icon-bg'}`}>
        {isAI ? <Sparkles size={16} className="text-orange" /> : <User size={16} className="text-navy" />}
      </div>

      <div className="ai-message-bubble-wrapper">
        <div className="ai-message-header">
          <span className="ai-sender-name font-display">{isAI ? 'AIET-UniSphere AI' : 'You'}</span>
          <span className="ai-message-time font-mono">{message.timestamp}</span>
        </div>

        <div
          className="ai-message-body"
          style={{
            overflowWrap: 'break-word',
            wordBreak: 'break-word',
            maxWidth: '100%',
          }}
        >
          {blocks.map((block, idx) => {
            if (block.type === 'header') {
              const fontSize = block.level === 1 ? '1.15rem' : block.level === 2 ? '1.05rem' : '0.975rem';
              return (
                <h3
                  key={idx}
                  className="font-display"
                  style={{
                    fontSize,
                    fontWeight: 700,
                    margin: idx === 0 ? '0 0 0.4rem 0' : '0.75rem 0 0.4rem 0',
                    lineHeight: 1.35,
                    color: isAI ? 'var(--brand-black)' : 'var(--brand-white)',
                  }}
                >
                  {renderInlineMarkdown(block.content || '')}
                </h3>
              );
            }

            if (block.type === 'bullet_list') {
              return (
                <ul
                  key={idx}
                  style={{
                    margin: '0.4rem 0 0.6rem 0',
                    paddingLeft: '1.25rem',
                    listStyleType: 'disc',
                  }}
                >
                  {block.items?.map((item, itemIdx) => (
                    <li key={itemIdx} style={{ marginBottom: '0.4rem', lineHeight: 1.5 }}>
                      {renderListItemContent(item, isAI)}
                    </li>
                  ))}
                </ul>
              );
            }

            if (block.type === 'ordered_list') {
              return (
                <ol
                  key={idx}
                  style={{
                    margin: '0.4rem 0 0.6rem 0',
                    paddingLeft: '1.25rem',
                    listStyleType: 'decimal',
                  }}
                >
                  {block.items?.map((item, itemIdx) => (
                    <li key={itemIdx} style={{ marginBottom: '0.4rem', lineHeight: 1.5 }}>
                      {renderListItemContent(item, isAI)}
                    </li>
                  ))}
                </ol>
              );
            }

            if (block.type === 'code_block') {
              return (
                <pre
                  key={idx}
                  style={{
                    backgroundColor: isAI ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.15)',
                    padding: '0.6rem 0.8rem',
                    borderRadius: '0.375rem',
                    overflowX: 'auto',
                    margin: '0.4rem 0',
                  }}
                >
                  <code className="font-mono" style={{ fontSize: '0.85rem', color: 'inherit' }}>
                    {block.content}
                  </code>
                </pre>
              );
            }

            // Paragraph handling (Status messages, Section headings, or standard text)
            const textContent = block.content || '';
            const statusMatch = textContent.trim().match(/^([✅❌⚠️ℹ️💡])\s*(.*)/);
            if (statusMatch) {
              const emoji = statusMatch[1];
              const statusText = statusMatch[2];

              let bg = 'rgba(11, 83, 160, 0.05)';
              let border = '1px solid rgba(11, 83, 160, 0.15)';

              if (emoji === '✅') {
                bg = 'rgba(16, 185, 129, 0.07)';
                border = '1px solid rgba(16, 185, 129, 0.22)';
              } else if (emoji === '❌') {
                bg = 'rgba(239, 68, 68, 0.07)';
                border = '1px solid rgba(239, 68, 68, 0.22)';
              } else if (emoji === '⚠️') {
                bg = 'rgba(245, 158, 11, 0.08)';
                border = '1px solid rgba(245, 158, 11, 0.22)';
              }

              return (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: '0.5rem',
                    padding: '0.45rem 0.75rem',
                    borderRadius: '0.375rem',
                    backgroundColor: isAI ? bg : 'rgba(255, 255, 255, 0.15)',
                    border: isAI ? border : '1px solid rgba(255, 255, 255, 0.25)',
                    margin: '0.6rem 0 0.35rem 0',
                    fontSize: '0.88rem',
                    lineHeight: 1.45,
                  }}
                >
                  <span style={{ fontSize: '1em', flexShrink: 0 }}>{emoji}</span>
                  <span style={{ color: 'inherit', flex: 1 }}>{renderInlineMarkdown(statusText)}</span>
                </div>
              );
            }

            const sectionHeadingMatch = textContent.trim().match(/^(📊|📅|📚|🔔|📝|🎓|📈|📌|📋)\s+(.+)$/);
            if (sectionHeadingMatch) {
              return (
                <h3
                  key={idx}
                  className="font-display"
                  style={{
                    fontSize: '1rem',
                    fontWeight: 700,
                    margin: idx === 0 ? '0 0 0.4rem 0' : '0.75rem 0 0.4rem 0',
                    lineHeight: 1.35,
                    color: isAI ? 'var(--brand-black)' : 'var(--brand-white)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                  }}
                >
                  <span>{sectionHeadingMatch[1]}</span>
                  <span>{renderInlineMarkdown(sectionHeadingMatch[2])}</span>
                </h3>
              );
            }

            return (
              <p
                key={idx}
                style={{
                  margin: '0.35rem 0',
                  lineHeight: 1.5,
                  color: 'inherit',
                }}
              >
                {renderInlineMarkdown(textContent)}
              </p>
            );
          })}
        </div>
      </div>
    </div>
  );
};
