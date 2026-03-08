'use client'

import { useState, useRef, useEffect } from 'react';

export function AiAssistant() {
  const [query, setQuery] = useState('');
  const [guru, setGuru] = useState('ramit_sethi');
  const [messages, setMessages] = useState([
    { role: 'ai', text: 'Hi! I can provide advice based on different financial philosophies. Who should I channel today?' }
  ]);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend() {
    if (!query.trim()) return;

    const newMessages = [...messages, { role: 'user', text: query }];
    setMessages(newMessages);
    setQuery('');
    setLoading(true);

    try {
      const token = localStorage.getItem('sb-token');
      const res = await fetch('http://localhost:8000/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          message: query,
          guru_preference: guru
        }),
      });

      const data = await res.json();
      setMessages([...newMessages, { role: 'ai', text: data.response }]);
    } catch (err) {
      setMessages([...newMessages, { role: 'ai', text: 'Error connecting to server.' }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white/85 backdrop-blur border border-white/70 rounded-3xl shadow-xl shadow-slate-200/60 flex flex-col h-[540px] overflow-hidden">
      <div className="p-4 border-b border-slate-200/70 bg-white/70">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Advisor</p>
            <h2 className="text-lg font-semibold text-slate-900">Finance Assistant</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-widest text-slate-400">Guru</span>
            <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-2 py-1">
              {[
                { key: 'ramit_sethi', label: 'Ramit' },
                { key: 'robert_kiyosaki', label: 'Kiyosaki' },
                { key: 'warren_buffett', label: 'Buffett' },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setGuru(item.key)}
                  className={`px-3 py-1 text-xs font-semibold rounded-xl transition ${
                    guru === item.key
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 p-4 overflow-y-auto bg-slate-50/70 space-y-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'bg-slate-900 text-white rounded-br-md shadow'
                  : 'bg-white border border-slate-200 text-slate-800 rounded-bl-md shadow-sm'
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
        {loading && <div className="text-slate-400 text-xs italic ml-2">Thinking...</div>}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-white/80 border-t border-slate-200/70 flex gap-2">
        <input
          className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/20"
          placeholder={`Ask ${guru.replace('_', ' ')} about your money...`}
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
  );
}
