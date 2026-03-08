'use client'

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { exchangeSplitwiseCode } from '../../../lib/api';

export default function SplitwiseCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState('Connecting to Splitwise...');

  useEffect(() => {
    const code = searchParams.get('code');
    if (!code) {
      setStatus('Missing authorization code.');
      return;
    }

    const token = localStorage.getItem('sb-token');
    if (!token) {
      setStatus('You must be logged in.');
      return;
    }

    const redirectUri = `${window.location.origin}/splitwise/callback`;

    exchangeSplitwiseCode(token, code, redirectUri)
      .then(() => {
        setStatus('Splitwise connected. Redirecting...');
        setTimeout(() => router.push('/'), 800);
      })
      .catch((err) => {
        setStatus(err.message || 'Failed to connect Splitwise.');
      });
  }, [searchParams, router]);

  return (
    <div className="min-h-screen app-bg flex items-center justify-center px-4">
      <div className="bg-white/85 backdrop-blur border border-white/70 rounded-3xl shadow-xl shadow-slate-200/60 p-6 text-slate-700">
        {status}
      </div>
    </div>
  );
}
