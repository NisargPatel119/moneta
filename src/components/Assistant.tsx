'use client';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowUp, KeyRound, RotateCcw, Sparkles } from 'lucide-react';
import { Card, cn } from './ui';

export type ChatMessage = { role: 'user' | 'assistant'; content: string; error?: boolean };

const SUGGESTIONS = [
  'Where did most of my money go last month?',
  'Do I have any recurring subscriptions?',
  'How is my portfolio allocated, and is it concentrated?',
  'How does this month compare to last month?',
];

// Messages live in the parent so the conversation survives switching tabs
export function Assistant({ messages, setMessages }: {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
}) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [needsKey, setNeedsKey] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    const history = [...messages.filter(m => !m.error), { role: 'user' as const, content: question }];
    setMessages([...history, { role: 'assistant', content: '' }]);
    setInput('');
    setBusy(true);

    const setReply = (content: string, error = false) =>
      setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content, error }]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history.map(({ role, content }) => ({ role, content })) }),
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        if (body.error === 'NO_KEY') {
          setNeedsKey(true);
          setMessages(messages);
          return;
        }
        setReply(body.error || 'Something went wrong. Please try again.', true);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let reply = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        reply += decoder.decode(value, { stream: true });
        setReply(reply);
      }
      if (!reply) setReply('The AI returned an empty response. Please try again.', true);
    } catch {
      setReply('Network error. Check your connection and try again.', true);
    } finally {
      setBusy(false);
    }
  }

  if (needsKey) return <SetupCard onRetry={() => setNeedsKey(false)} />;

  return (
    <Card className="flex flex-col h-[calc(100dvh-15rem)] md:h-[calc(100dvh-12rem)] min-h-[24rem] overflow-hidden">
      <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-line">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink-2">
          <Sparkles size={16} className="text-accent" /> Ask about your money
        </div>
        {messages.length > 0 && (
          <button onClick={() => setMessages([])} disabled={busy} className="flex items-center gap-1 text-xs font-semibold text-muted hover:text-ink disabled:opacity-50">
            <RotateCcw size={14} /> New chat
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-4">
        {messages.length === 0 ? (
          <div className="min-h-full flex flex-col items-center justify-center text-center gap-5">
            <div className="w-12 h-12 rounded-2xl bg-accent-soft text-accent flex items-center justify-center">
              <Sparkles size={22} />
            </div>
            <div>
              <p className="font-semibold text-ink">What would you like to know?</p>
              <p className="text-sm text-muted mt-1">I can see your accounts, the last 90 days of transactions and your holdings.</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 max-w-xl">
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => send(s)} className="text-sm font-medium text-ink-2 bg-sunken border border-line rounded-full px-3.5 py-2 hover:bg-accent-soft hover:border-accent/30 hover:text-accent transition-colors">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div className={cn(
                'max-w-[88%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                m.role === 'user' ? 'bg-accent text-on-accent rounded-br-md'
                  : m.error ? 'bg-warn-soft text-warn border border-warn/30 rounded-bl-md'
                    : 'bg-sunken text-ink rounded-bl-md'
              )}>
                {m.role === 'assistant' && !m.content ? <TypingDots /> : m.role === 'assistant' ? <Markdown text={m.content} /> : m.content}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={e => { e.preventDefault(); send(input); }}
        className="border-t border-line p-3 flex items-end gap-2"
      >
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); }
          }}
          rows={1}
          placeholder="Ask a question…"
          className="flex-1 resize-none bg-sunken border border-line rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent focus:bg-surface max-h-32"
        />
        <button type="submit" disabled={busy || !input.trim()} aria-label="Send" className="w-10 h-10 shrink-0 rounded-xl bg-accent text-on-accent flex items-center justify-center disabled:opacity-40 hover:bg-accent-strong">
          <ArrowUp size={18} />
        </button>
      </form>
      <p className="text-[11px] text-faint text-center pb-2 px-4">AI can make mistakes. Not professional financial advice.</p>
    </Card>
  );
}

function SetupCard({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className="p-6 sm:p-8 max-w-xl">
      <div className="flex items-center gap-2 text-ink font-semibold">
        <KeyRound size={18} className="text-accent" /> Set up the AI assistant (free)
      </div>
      <ol className="list-decimal pl-5 mt-4 space-y-2 text-sm text-muted">
        <li>Create a free account at <a className="text-accent underline" href="https://console.groq.com/keys" target="_blank" rel="noreferrer">console.groq.com/keys</a> (no credit card) and create an API key.</li>
        <li>Add it as <code className="bg-sunken px-1.5 py-0.5 rounded text-ink">GROQ_API_KEY</code> in <code className="bg-sunken px-1.5 py-0.5 rounded text-ink">.env.local</code> and in your Vercel project&apos;s Environment Variables.</li>
        <li>Restart the dev server / redeploy on Vercel.</li>
      </ol>
      <button onClick={onRetry} className="mt-6 bg-accent text-on-accent px-4 py-2 rounded-xl text-sm font-semibold hover:bg-accent-strong">I&apos;ve added it, try again</button>
    </Card>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex gap-1 py-1" aria-label="Thinking">
      {[0, 150, 300].map(d => <span key={d} className="w-1.5 h-1.5 rounded-full bg-faint animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
    </span>
  );
}

// Minimal markdown: headings, bullet/numbered lists, **bold**, *italic*, `code`, paragraphs
function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? 'ol' : 'ul';
    blocks.push(
      <Tag key={blocks.length} className={cn('pl-5 space-y-1', list.ordered ?'list-decimal' : 'list-disc')}>
        {list.items.map((item, i) => <li key={i}>{inline(item)}</li>)}
      </Tag>
    );
    list = null;
  };

  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)/);
    const heading = line.match(/^#{1,6}\s+(.*)/);
    if (bullet || numbered) {
      const ordered = !!numbered;
      if (list && list.ordered !== ordered) flush();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
    } else {
      flush();
      if (heading) blocks.push(<p key={blocks.length} className="font-bold text-ink">{inline(heading[1])}</p>);
      else if (line.trim()) blocks.push(<p key={blocks.length}>{inline(line)}</p>);
    }
  }
  flush();
  return <div className="space-y-2">{blocks}</div>;
}

function inline(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={i} className="font-semibold text-ink">{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return <code key={i} className="bg-white/70 px-1 rounded text-[0.9em]">{part.slice(1, -1)}</code>;
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}
