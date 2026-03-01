// app/components/AiAssistant.jsx
'use client'
import { useState, useRef, useEffect } from 'react';

export function AiAssistant() {
  const [query, setQuery] = useState("");
  const [guru, setGuru] = useState("ramit_sethi"); // Default Guru
  const [messages, setMessages] = useState([
    { role: 'ai', text: 'Hi! I can provide advice based on different financial philosophies. Who should I channel today?' }
  ]);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    if (!query.trim()) return;

    const newMessages = [...messages, { role: 'user', text: query }];
    setMessages(newMessages);
    setQuery("");
    setLoading(true);

    try {
      const token = localStorage.getItem('sb-token');
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          message: query,
          guru_preference: guru // Passing the selected guru to the backend
        }),
      });
      
      const data = await res.json();
      setMessages([...newMessages, { role: 'ai', text: data.response }]);
    } catch (err) {
      setMessages([...newMessages, { role: 'ai', text: "Error connecting to server." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col h-[500px]">
      <div className="bg-blue-600 text-white p-4 font-bold flex justify-between items-center rounded-t-xl">
        <div className="flex flex-col">
          <span>Finance Assistant</span>
          <select 
            value={guru} 
            onChange={(e) => setGuru(e.target.value)}
            className="mt-1 text-xs bg-blue-700 text-white border-none rounded p-1 focus:ring-0 cursor-pointer"
          >
            <option value="ramit_sethi">Ramit Sethi (Conscious Spending)</option>
            <option value="robert_kiyosaki">Robert Kiyosaki (Assets/Liabilities)</option>
            <option value="warren_buffett">Warren Buffett (Value Investing)</option>
          </select>
        </div>
        <span className="text-xs bg-blue-500 px-2 py-1 rounded">Financial Guru</span>
      </div>

      <div className="flex-1 p-4 overflow-y-auto bg-gray-50 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${
              m.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white border border-gray-200 text-gray-800 rounded-bl-none shadow-sm'
            }`}>
              {m.text}
            </div>
          </div>
        ))}
        {loading && <div className="text-gray-400 text-xs italic ml-2">Thinking...</div>}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-3 bg-white border-t flex gap-2 rounded-b-xl">
        <input 
          className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
          placeholder={`Ask ${guru.replace('_', ' ')} about your money...`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
        />
        <button onClick={handleSend} disabled={loading} className="bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700">➤</button>
      </div>
    </div>
  );
}