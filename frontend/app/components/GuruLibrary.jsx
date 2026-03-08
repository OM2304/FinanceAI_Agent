'use client'

import { useEffect, useState } from 'react';
import { fetchGuruDocuments, uploadGuruDocument } from '../../lib/api';

const GURUS = [
  'Warren Buffett',
  'Robert Kiyosaki',
  'Ramit Sethi',
];

export function GuruLibrary() {
  const [guru, setGuru] = useState(GURUS[0]);
  const [documents, setDocuments] = useState([]);
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  const loadDocs = async (selectedGuru) => {
    const token = localStorage.getItem('sb-token');
    if (!token) return;
    setError('');
    try {
      const res = await fetchGuruDocuments(token, selectedGuru);
      setDocuments(res.documents || []);
    } catch (err) {
      setError(err.message || 'Failed to load documents');
    }
  };

  useEffect(() => {
    loadDocs(guru);
  }, [guru]);

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) return;
    const token = localStorage.getItem('sb-token');
    if (!token) return;

    setStatus('uploading');
    setError('');
    try {
      await uploadGuruDocument({ file, guru, title }, token);
      setFile(null);
      setTitle('');
      setStatus('idle');
      await loadDocs(guru);
    } catch (err) {
      setStatus('idle');
      setError(err.message || 'Upload failed');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <section className="lg:col-span-2 bg-white/85 backdrop-blur border border-white/70 rounded-3xl shadow-xl shadow-slate-200/60 p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Guru Library</h2>
            <p className="text-sm text-slate-600">Upload books or articles and attach them to a specific guru.</p>
          </div>
          <select
            value={guru}
            onChange={(e) => setGuru(e.target.value)}
            className="text-sm rounded-2xl border border-slate-200 bg-white px-3 py-2 text-slate-900"
          >
            {GURUS.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>

        {error && (
          <div className="mb-4 bg-rose-50 border border-rose-100 p-3 rounded-2xl text-sm text-rose-700">
            {error}
          </div>
        )}

        <form onSubmit={handleUpload} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700">Document title (optional)</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900"
              placeholder="e.g., Berkshire Letter 2023"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">File (PDF/TXT/MD)</label>
            <input
              type="file"
              accept=".pdf,.txt,.md"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            />
          </div>
          <div className="md:col-span-3">
            <button
              type="submit"
              disabled={status === 'uploading' || !file}
              className="bg-slate-900 text-white px-6 py-2 rounded-2xl hover:bg-slate-800 disabled:opacity-50"
            >
              {status === 'uploading' ? 'Uploading...' : 'Upload Document'}
            </button>
          </div>
        </form>
      </section>

      <section className="bg-white/85 backdrop-blur border border-white/70 rounded-3xl shadow-xl shadow-slate-200/60 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900">Uploaded Docs</h3>
          <span className="text-xs uppercase tracking-[0.2em] text-slate-400">{guru}</span>
        </div>

        {documents.length === 0 && (
          <div className="text-sm text-slate-500">No documents uploaded yet.</div>
        )}

        <div className="space-y-3">
          {documents.map((doc) => (
            <div key={doc.id} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-3">
              <p className="text-sm font-semibold text-slate-800">{doc.title}</p>
              <p className="text-xs text-slate-500">Chunks: {doc.chunk_count}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
