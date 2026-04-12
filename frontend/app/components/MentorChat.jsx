'use client'

import { useState, useRef, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';

const STORAGE_MESSAGES_KEY = 'mentor_chat_messages';
const STORAGE_DRAFT_KEY = 'mentor_chat_draft';

const DEFAULT_MESSAGES = [
  { role: 'ai', text: 'Hi! Ask me anything about your finances and I will respond with a focused 3-step plan.' },
];

export function MentorChat() {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_MESSAGES;
    try {
      const savedMessages = localStorage.getItem(STORAGE_MESSAGES_KEY);
      if (savedMessages) {
        const parsed = JSON.parse(savedMessages);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const normalized = parsed
            .map((m) => ({
              role: m?.role || 'ai',
              text: m?.text ?? m?.content ?? '',
            }))
            .filter((m) => (m.text || '').trim().length > 0);
          if (normalized.length > 0) {
            return normalized;
          }
        }
      }
    } catch (err) {
      console.error('Failed to load chat messages', err);
    }
    return DEFAULT_MESSAGES;
  });
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    try {
      const savedDraft = localStorage.getItem(STORAGE_DRAFT_KEY);
      if (savedDraft !== null) {
        setQuery(savedDraft);
      }

      const savedMessages = localStorage.getItem(STORAGE_MESSAGES_KEY);
      if (savedMessages) {
        const parsed = JSON.parse(savedMessages);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const normalized = parsed
            .map((m) => ({
              role: m?.role || 'ai',
              text: m?.text ?? m?.content ?? '',
              created_at: m?.created_at,
            }))
            .filter((m) => (m.text || '').trim().length > 0);
          if (normalized.length > 0) {
            setMessages(normalized);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load chat draft/messages', err);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_MESSAGES_KEY, JSON.stringify(messages));
    } catch (err) {
      console.error('Failed to persist messages', err);
    }
  }, [messages]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_DRAFT_KEY, query);
    } catch (err) {
      console.error('Failed to persist draft', err);
    }
  }, [query]);

  useEffect(() => {
    async function fetchHistory() {
      try {
        const token = localStorage.getItem('sb-token');
        if (!token) return;

        const res = await fetch('http://localhost:8000/ai/chat-history', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.messages) && data.messages.length > 0) {
          const normalized = data.messages
            .map((m) => ({
              role: m?.role || 'ai',
              text: m?.text ?? m?.content ?? '',
              created_at: m?.created_at,
            }))
            .filter((m) => (m.text || '').trim().length > 0);
          if (normalized.length > 0) {
            setHistory(normalized);
          }
        }
      } catch (err) {
        console.error('Failed to fetch chat history', err);
      }
    }

    fetchHistory();
  }, []);

  async function handleSend() {
    if (!query.trim() || loading) return;

    const newMessages = [...messages, { role: 'user', text: query }];
    setMessages(newMessages);
    setQuery('');
    setLoading(true);

    try {
      const token = localStorage.getItem('sb-token');
      const res = await fetch('http://localhost:8000/ai/mentor-advice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ user_query: query }),
      });

      const data = await res.json();
      setMessages([...newMessages, { role: 'ai', text: data.response || 'No response.' }]);
    } catch (err) {
      setMessages([...newMessages, { role: 'ai', text: 'Error connecting to server.' }]);
    } finally {
      setLoading(false);
    }
  }

  function handleNewChat() {
    setMessages(DEFAULT_MESSAGES);
    setQuery('');
    try {
      localStorage.removeItem(STORAGE_MESSAGES_KEY);
      localStorage.removeItem(STORAGE_DRAFT_KEY);
    } catch (err) {
      console.error('Failed to clear local storage', err);
    }
  }

  const recentChats = useMemo(() => {
    if (!history || history.length === 0) return [];
    const chats = [];
    let current = [];
    history.forEach((msg) => {
      if (msg.role === 'user') {
        if (current.length > 0) {
          chats.push(current);
        }
        current = [msg];
      } else if (current.length > 0) {
        current.push(msg);
      }
    });
    if (current.length > 0) {
      chats.push(current);
    }
    return chats.slice(0, 50);
  }, [history]);

  function handleSelectChat(chatMessages) {
    if (!Array.isArray(chatMessages) || chatMessages.length === 0) return;
    setMessages(chatMessages);
  }

  return (
    <div className="bg-white/85 backdrop-blur border border-white/70 rounded-3xl shadow-xl shadow-slate-200/60 flex h-[540px] overflow-hidden">
      <aside className="w-[300px] border-r border-slate-200/70 bg-white/80 p-4 flex flex-col">
        <button
          type="button"
          onClick={handleNewChat}
          className="w-full mb-4 px-4 py-3 text-sm font-semibold rounded-xl bg-slate-900 text-white hover:bg-slate-800"
        >
          New Chat
        </button>
        <div className="text-xs uppercase tracking-[0.2em] text-slate-400 mb-3">Recent Chats</div>
        <div className="flex-1 overflow-y-auto space-y-2">
          {recentChats.length === 0 && (
            <div className="text-xs text-slate-400">No recent chats yet.</div>
          )}
          {recentChats.map((chat, idx) => {
            const firstUser = chat.find((m) => m.role === 'user');
            const snippet = (firstUser?.text || '').slice(0, 60) || 'Untitled chat';
            return (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelectChat(chat)}
                className="w-full text-left px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm text-slate-700"
              >
                {snippet}
              </button>
            );
          })}
        </div>
      </aside>

      <div className="flex-1 flex flex-col">
        <div className="p-4 border-b border-slate-200/70 bg-white/70">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Mentor</p>
            <h2 className="text-lg font-semibold text-slate-900">Financial Mentor</h2>
          </div>
        </div>

        <div className="flex-1 p-4 overflow-y-auto bg-slate-50/70 space-y-4">
          {messages.length > 0 && messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap leading-[1.4] ${
                  m.role === 'user'
                    ? 'bg-slate-900 text-white rounded-br-md shadow'
                    : 'bg-white border border-slate-200 text-slate-800 rounded-bl-md shadow-sm'
                }`}
              >
                <ReactMarkdown
                  components={{
                    p: ({ children }) => (
                      <p className="mb-2 last:mb-0">
                        {children}
                      </p>
                    ),
                  }}
                >
                  {m.text ?? ''}
                </ReactMarkdown>
              </div>
            </div>
          ))}
          {loading && <div className="text-slate-400 text-xs italic ml-2">Thinking...</div>}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 bg-white/80 border-t border-slate-200/70 flex gap-2">
          <input
            className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/20"
            placeholder="Ask your mentor about your money..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          />
          <button
            onClick={handleSend}
            disabled={loading}
            className="h-11 w-11 rounded-2xl bg-slate-900 text-white flex items-center justify-center hover:bg-slate-800 disabled:opacity-50"
            aria-label="Send"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 12h14" strokeLinecap="round" />
              <path d="M12 5l6 7-6 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
