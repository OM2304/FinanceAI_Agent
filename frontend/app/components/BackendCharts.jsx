'use client'
import { useState, useEffect } from 'react';

export function BackendCharts() {
  const [barChartUrl, setBarChartUrl] = useState(null);
  const [lineChartUrl, setLineChartUrl] = useState(null);
  const [pieChartUrl, setPieChartUrl] = useState(null);
  const [merchantsChartUrl, setMerchantsChartUrl] = useState(null);
  const [barChartError, setBarChartError] = useState(false);
  const [lineChartError, setLineChartError] = useState(false);
  const [pieChartError, setPieChartError] = useState(false);
  const [merchantsChartError, setMerchantsChartError] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [modalImage, setModalImage] = useState(null);
  const [modalTitle, setModalTitle] = useState('');

  const barChartEndpoint = "http://localhost:8000/reports/bar";
  const lineChartEndpoint = "http://localhost:8000/reports/line";
  const pieChartEndpoint = "http://localhost:8000/reports/pie";
  const merchantsChartEndpoint = "http://localhost:8000/reports/merchants";

  useEffect(() => {
    setIsClient(true);
  }, []);

  const fetchChart = async (endpoint, setUrl, setError) => {
    try {
      const token = localStorage.getItem('sb-token');
      if (!token) return;

      const res = await fetch(endpoint, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        setUrl(url);
        setError(false);
      } else {
        setError(true);
      }
    } catch (e) {
      console.error(`Error fetching ${endpoint} chart:`, e);
      setError(true);
    }
  };

  useEffect(() => {
    const fetchCharts = () => {
      if (isClient) {
        fetchChart(barChartEndpoint, setBarChartUrl, setBarChartError);
        fetchChart(lineChartEndpoint, setLineChartUrl, setLineChartError);
        fetchChart(pieChartEndpoint, setPieChartUrl, setPieChartError);
        fetchChart(merchantsChartEndpoint, setMerchantsChartUrl, setMerchantsChartError);
      }
    };

    fetchCharts();

    return () => {
      if (barChartUrl) URL.revokeObjectURL(barChartUrl);
      if (lineChartUrl) URL.revokeObjectURL(lineChartUrl);
      if (pieChartUrl) URL.revokeObjectURL(pieChartUrl);
      if (merchantsChartUrl) URL.revokeObjectURL(merchantsChartUrl);
    };
  }, [isClient]);

  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-semibold text-slate-900">Financial Analytics</h2>
        <button
          onClick={() => {
            const token = localStorage.getItem('sb-token');
            if (token) {
              fetch('http://localhost:8000/reports/refresh', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
              }).then(() => {
                setBarChartUrl(null);
                setLineChartUrl(null);
                setPieChartUrl(null);
                setMerchantsChartUrl(null);
                setBarChartError(false);
                setLineChartError(false);
                setPieChartError(false);
                setMerchantsChartError(false);
                setTimeout(() => {
                  fetchChart(barChartEndpoint, setBarChartUrl, setBarChartError);
                  fetchChart(lineChartEndpoint, setLineChartUrl, setLineChartError);
                  fetchChart(pieChartEndpoint, setPieChartUrl, setPieChartError);
                  fetchChart(merchantsChartEndpoint, setMerchantsChartUrl, setMerchantsChartError);
                }, 2000);
              }).catch(err => console.error('Error refreshing charts:', err));
            }
          }}
          className="px-4 py-2 rounded-2xl border border-slate-200 text-slate-800 bg-transparent hover:bg-slate-50 text-sm font-medium shadow-sm"
        >
          Refresh All Charts
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="bg-white/85 backdrop-blur p-6 rounded-3xl shadow-sm border border-slate-200/70">
          <h2 className="text-xl font-semibold mb-4 text-slate-900">Total Spending by Category</h2>
          <div className="w-full h-64 flex items-center justify-center bg-slate-50/70 rounded-2xl border border-slate-200/70">
            {!barChartError && barChartUrl ? (
              <img
                src={barChartUrl}
                alt="Spending by Category Chart"
                className="max-w-full max-h-full object-contain cursor-pointer hover:opacity-80 transition-opacity"
                onError={() => setBarChartError(true)}
                onClick={() => {
                  setModalImage(barChartUrl);
                  setModalTitle('Total Spending by Category');
                }}
              />
            ) : (
              <p className="text-slate-500 text-sm">Chart will appear after processing transactions</p>
            )}
          </div>
        </section>

        <section className="bg-white/85 backdrop-blur p-6 rounded-3xl shadow-sm border border-slate-200/70">
          <h2 className="text-xl font-semibold mb-4 text-slate-900">Monthly Spending Trend</h2>
          <div className="w-full h-64 flex items-center justify-center bg-slate-50/70 rounded-2xl border border-slate-200/70">
            {!lineChartError && lineChartUrl ? (
              <img
                src={lineChartUrl}
                alt="Monthly Spending Trend Chart"
                className="max-w-full max-h-full object-contain cursor-pointer hover:opacity-80 transition-opacity"
                onError={() => setLineChartError(true)}
                onClick={() => {
                  setModalImage(lineChartUrl);
                  setModalTitle('Monthly Spending Trend');
                }}
              />
            ) : (
              <p className="text-slate-500 text-sm">Chart will appear after processing transactions</p>
            )}
          </div>
        </section>

        <section className="bg-white/85 backdrop-blur p-6 rounded-3xl shadow-sm border border-slate-200/70">
          <h2 className="text-xl font-semibold mb-4 text-slate-900">Spending Distribution by Category</h2>
          <div className="w-full h-64 flex items-center justify-center bg-slate-50/70 rounded-2xl border border-slate-200/70">
            {!pieChartError && pieChartUrl ? (
              <img
                src={pieChartUrl}
                alt="Spending Distribution Chart"
                className="max-w-full max-h-full object-contain cursor-pointer hover:opacity-80 transition-opacity"
                onError={() => setPieChartError(true)}
                onClick={() => {
                  setModalImage(pieChartUrl);
                  setModalTitle('Spending Distribution by Category');
                }}
              />
            ) : (
              <p className="text-slate-500 text-sm">Chart will appear after processing transactions</p>
            )}
          </div>
        </section>

        <section className="bg-white/85 backdrop-blur p-6 rounded-3xl shadow-sm border border-slate-200/70">
          <h2 className="text-xl font-semibold mb-4 text-slate-900">Top 10 Merchants by Spending</h2>
          <div className="w-full h-64 flex items-center justify-center bg-slate-50/70 rounded-2xl border border-slate-200/70">
            {!merchantsChartError && merchantsChartUrl ? (
              <img
                src={merchantsChartUrl}
                alt="Top Merchants Chart"
                className="max-w-full max-h-full object-contain cursor-pointer hover:opacity-80 transition-opacity"
                onError={() => setMerchantsChartError(true)}
                onClick={() => {
                  setModalImage(merchantsChartUrl);
                  setModalTitle('Top 10 Merchants by Spending');
                }}
              />
            ) : (
              <p className="text-slate-500 text-sm">Chart will appear after processing transactions</p>
            )}
          </div>
        </section>
      </div>

      {modalImage && (
        <div
          className="fixed inset-0 bg-slate-950/80 flex items-center justify-center z-50 p-4"
          onClick={() => setModalImage(null)}
        >
          <div className="relative max-w-4xl max-h-full bg-white/90 backdrop-blur rounded-3xl shadow-xl">
            <button
              onClick={() => setModalImage(null)}
              className="absolute top-4 right-4 w-8 h-8 bg-slate-900 text-white rounded-full flex items-center justify-center hover:bg-slate-800 transition-colors z-10"
            >
              x
            </button>
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-4 text-slate-900">{modalTitle}</h3>
              <img
                src={modalImage}
                alt={modalTitle}
                className="max-w-full max-h-[70vh] object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
