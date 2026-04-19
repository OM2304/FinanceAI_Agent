'use client'

import { useState, useRef, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';

const STORAGE_MESSAGES_KEY = 'mentor_chat_messages';
const STORAGE_DRAFT_KEY = 'mentor_chat_draft';

const DEFAULT_MESSAGES = [
  { role: 'ai', text: 'Hi! Ask me anything about your finances and I will respond with a focused 3-step plan.', synced: true },
];

function normalizeChatMessage(message) {
  const normalizedRole = String(message?.role || 'ai').toLowerCase();
  return {
    role: normalizedRole === 'assistant' ? 'ai' : normalizedRole,
    text: String(message?.text ?? message?.content ?? '').trim(),
    created_at: message?.created_at ?? null,
    guru_id: message?.guru_id ?? null,
    synced: true,
  };
}

function groupConversations(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return [];
  const chats = [];
  let current = [];

  messages.forEach((msg) => {
    if (msg.role === 'user') {
      if (current.length > 0) chats.push(current);
      current = [msg];
      return;
    }
    if (current.length > 0) current.push(msg);
  });

  if (current.length > 0) chats.push(current);
  return chats.slice(0, 50);
}

function isGreetingMessage(text) {
  const normalized = String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, '');

  if (!normalized) return false;
  if (normalized.length > 32) return false;

  return (
    normalized === 'hi' ||
    normalized === 'hello' ||
    normalized === 'hey' ||
    normalized === 'hey there' ||
    normalized === 'hiya' ||
    normalized === 'yo' ||
    normalized === 'howdy' ||
    normalized === 'good morning' ||
    normalized === 'good afternoon' ||
    normalized === 'good evening'
  );
}

function toTitleFromText(text) {
  const sourceText = String(text || '').trim();
  if (!sourceText) return '';

  const words = sourceText.split(/\s+/).filter(Boolean);
  const maxWords = 6;
  const shortTitle = words.slice(0, maxWords).join(' ');
  return words.length > maxWords ? `${shortTitle}...` : shortTitle;
}

function buildConversationTitle(chatMessages) {
  const userMessages = (chatMessages || []).filter((m) => m?.role === 'user' && String(m?.text || '').trim());
  if (userMessages.length === 0) return 'Financial Review';

  const first = String(userMessages[0]?.text || '').trim();
  if (isGreetingMessage(first)) {
    const nextNonGreeting = userMessages
      .slice(1)
      .map((m) => String(m?.text || '').trim())
      .find((t) => t && !isGreetingMessage(t));

    return toTitleFromText(nextNonGreeting) || 'Financial Review';
  }

  return toTitleFromText(first) || 'Financial Review';
}

export function MentorChat({ guruId: controlledGuruId, onGuruChange } = {}) {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_MESSAGES;
    try {
      const savedMessages = localStorage.getItem(STORAGE_MESSAGES_KEY);
      if (savedMessages) {
        const parsed = JSON.parse(savedMessages);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const normalized = parsed.map(normalizeChatMessage).filter((m) => m.text.length > 0);
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
  const [activeConversationKey, setActiveConversationKey] = useState('live');
  const [loading, setLoading] = useState(false);
  const [resettingChat, setResettingChat] = useState(false);
  const [internalGuruId, setInternalGuruId] = useState('ramit');
  const messagesEndRef = useRef(null);
  const recentChats = useMemo(() => groupConversations(history), [history]);
  const guruId = controlledGuruId ?? internalGuruId;

  const setGuruId = (next) => {
    const normalized = String(next || '').trim().toLowerCase();
    if (!normalized) return;
    if (typeof onGuruChange === 'function') {
      onGuruChange(normalized);
      return;
    }
    setInternalGuruId(normalized);
  };

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
          const normalized = parsed.map(normalizeChatMessage).filter((m) => m.text.length > 0);
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
    if (controlledGuruId) return;
    try {
      const storedGuru = localStorage.getItem('mentor_chat_guru_id');
      if (storedGuru) {
        setInternalGuruId(String(storedGuru).trim().toLowerCase());
      }
    } catch {
      // ignore
    }
  }, [controlledGuruId]);

  useEffect(() => {
    if (controlledGuruId) return;
    try {
      localStorage.setItem('mentor_chat_guru_id', guruId);
    } catch {
      // ignore
    }
  }, [guruId, controlledGuruId]);

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

  async function fetchHistory() {
    try {
      const token = localStorage.getItem('sb-token');
      if (!token) {
        setHistory([]);
        return;
      }

      const res = await fetch('http://localhost:8000/ai/chat-history', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!res.ok) return;

      const data = await res.json();
      if (Array.isArray(data.messages)) {
        const normalized = data.messages.map(normalizeChatMessage).filter((m) => m.text.length > 0);
        setHistory(normalized);
      }
    } catch (err) {
      console.error('Failed to fetch chat history', err);
    }
  }

  async function persistUnsyncedSession(sourceMessages) {
    const persistable = (sourceMessages || [])
      .filter((m) => m && typeof m.text === 'string')
      .filter((m) => m.text.trim().length > 0)
      .filter((m) => (m.role === 'user' || m.role === 'ai' || m.role === 'assistant'))
      .filter((m) => m.synced !== true);

    if (persistable.length === 0) return;

    const token = localStorage.getItem('sb-token');
    if (!token) return;

    const res = await fetch('http://localhost:8000/ai/chat-history/save-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        guru_id: guruId,
        messages: persistable.map((m) => ({
          role: m.role,
          text: m.text,
          guru_id: m.guru_id ?? guruId,
        })),
      }),
    });

    if (!res.ok) {
      throw new Error('Failed to persist chat session before reset.');
    }
  }

  useEffect(() => {
    fetchHistory();
  }, []);

  async function handleSend() {
    if (!query.trim() || loading) return;

    const trimmedQuery = query.trim();
    const userMessage = { role: 'user', text: trimmedQuery, synced: false, guru_id: guruId };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setActiveConversationKey('live');
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
        body: JSON.stringify({ user_query: trimmedQuery, guru_id: guruId }),
      });

      if (!res.ok) {
        throw new Error(`Mentor request failed with status ${res.status}`);
      }

      const data = await res.json();
      const syncedUserMessages = newMessages.map((msg) => (msg === userMessage ? { ...msg, synced: true } : msg));
      setMessages([
        ...syncedUserMessages,
        { role: 'ai', text: data.response || 'No response.', synced: true, guru_id: data.guru_id ?? guruId },
      ]);
    } catch {
      setMessages([...newMessages, { role: 'ai', text: 'Error connecting to server.', synced: false }]);
    } finally {
      setLoading(false);
    }
  }

  async function handleNewChat() {
    if (resettingChat || loading) return;
    setResettingChat(true);

    try {
      await persistUnsyncedSession(messages);
      await fetchHistory();
    } catch (err) {
      console.error('Failed to persist current chat before reset', err);
    } finally {
      setMessages(DEFAULT_MESSAGES);
      setQuery('');
      setActiveConversationKey('live');
      localStorage.removeItem(STORAGE_MESSAGES_KEY);
      localStorage.removeItem(STORAGE_DRAFT_KEY);
      setResettingChat(false);
    }
  }

  function handleSelectChat(chatMessages, key) {
    if (!Array.isArray(chatMessages) || chatMessages.length === 0) return;
    setMessages(chatMessages);
    setActiveConversationKey(key);
    const chatGuru = chatMessages.find((m) => m?.guru_id)?.guru_id;
    if (chatGuru) setGuruId(chatGuru);
  }

  return (
    <div className="relative max-w-full overflow-x-hidden bg-slate-50/95 backdrop-blur border border-slate-200/80 rounded-3xl shadow-xl shadow-slate-300/40 flex h-[540px] overflow-hidden">
      <aside className="relative z-20 w-[300px] shrink-0 border-r border-slate-300/70 bg-white/90 p-4 flex flex-col">
        <button
          type="button"
          onClick={handleNewChat}
          disabled={resettingChat || loading}
          className="w-full mb-4 px-4 py-3 text-sm font-semibold rounded-xl bg-[#1e293b] text-white hover:bg-[#0f172a] disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {resettingChat ? 'Saving...' : 'New Chat'}
        </button>
        <div className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-3">Recent Chats</div>
        <div className="flex-1 overflow-y-auto overflow-x-hidden space-y-2 border border-slate-300/70 rounded-2xl p-2 bg-white">
          {recentChats.length === 0 && (
            <div className="text-xs text-slate-500">No recent chats yet.</div>
          )}
          {recentChats.map((chat, idx) => {
            const firstUser = chat.find((m) => m.role === 'user');
            const snippet = buildConversationTitle(chat);
            const key = `${firstUser?.created_at ?? 'na'}-${idx}`;
            const isActive = activeConversationKey === key;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelectChat(chat, key)}
                className={`w-full text-left px-3 py-2 rounded-xl border text-sm ${
                  isActive
                    ? 'border-slate-200 bg-slate-50 text-[#1e293b]'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
                }`}
              >
                <span className="block min-w-0 truncate">{snippet}</span>
              </button>
            );
          })}
        </div>
      </aside>

      <div className="relative z-10 flex-1 min-w-0 max-w-full overflow-x-hidden flex flex-col">
        <div className="p-4 border-b border-slate-300/70 bg-white/80">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Mentor</p>
            <h2 className="text-lg font-semibold text-[#1e293b]">Financial Mentor</h2>
          </div>
        </div>

        <div className="flex-1 min-w-0 max-w-full overflow-x-hidden p-4 overflow-y-auto bg-slate-100/70 space-y-4">
          {messages.length > 0 && messages.map((m, i) => (
            <div key={i} className={`flex min-w-0 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`min-w-0 max-w-[85%] px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap break-words [word-break:break-word] leading-[1.4] ${
                  m.role === 'user'
                    ? 'bg-[#1e293b] text-white rounded-br-md shadow'
                    : 'bg-[#f8fafc] border border-slate-200 text-[#1e293b] rounded-bl-md shadow-sm'
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

        <div className="p-4 bg-white/90 border-t border-slate-300/70 flex gap-2">
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
            className="h-11 w-11 rounded-2xl bg-[#1e293b] text-white flex items-center justify-center hover:bg-[#0f172a] disabled:opacity-50"
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
