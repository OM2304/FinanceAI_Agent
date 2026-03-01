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

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  const barChartEndpoint = `${API_URL}/reports/bar`;
  const lineChartEndpoint = `${API_URL}/reports/line`;
  const pieChartEndpoint = `${API_URL}/reports/pie`;
  const merchantsChartEndpoint = `${API_URL}/reports/merchants`;

  useEffect(() => {
    setIsClient(true);
  }, []);

  const fetchChart = async (endpoint, setUrl, setError) => {
    try {
      const token = localStorage.getItem('sb-token');
      if (!token) return;
      
      const res = await fetch(endpoint, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
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

    // Cleanup object URLs to avoid memory leaks
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
        <h2 className="text-2xl font-bold text-gray-800">📊 Financial Analytics</h2>
        <button 
          onClick={() => {
            const token = localStorage.getItem('sb-token');
            if (token) {
              fetch(`${API_URL}/reports/refresh`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
              }).then(() => {
                // Refresh all charts after regeneration
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
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium shadow-md"
        >
          🔄 Refresh All Charts
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-xl font-semibold mb-4 text-gray-800">📊 Total Spending by Category</h2>
          <div className="w-full h-64 flex items-center justify-center bg-gray-50 rounded-lg">
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
              <p className="text-gray-500 text-sm">Chart will appear after processing transactions</p>
            )}
          </div>
        </section>
        
        <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-xl font-semibold mb-4 text-gray-800">📈 Monthly Spending Trend</h2>
          <div className="w-full h-64 flex items-center justify-center bg-gray-50 rounded-lg">
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
              <p className="text-gray-500 text-sm">Chart will appear after processing transactions</p>
            )}
          </div>
        </section>
        
        <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-xl font-semibold mb-4 text-gray-800">🥧 Spending Distribution by Category</h2>
          <div className="w-full h-64 flex items-center justify-center bg-gray-50 rounded-lg">
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
              <p className="text-gray-500 text-sm">Chart will appear after processing transactions</p>
            )}
          </div>
        </section>
        
        <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-xl font-semibold mb-4 text-gray-800">🏪 Top 10 Merchants by Spending</h2>
          <div className="w-full h-64 flex items-center justify-center bg-gray-50 rounded-lg">
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
              <p className="text-gray-500 text-sm">Chart will appear after processing transactions</p>
            )}
          </div>
        </section>
      </div>

      {/* Modal for enlarged chart view */}
      {modalImage && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
          onClick={() => setModalImage(null)}
        >
          <div className="relative max-w-4xl max-h-full bg-white rounded-lg shadow-xl">
            <button
              onClick={() => setModalImage(null)}
              className="absolute top-4 right-4 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors z-10"
            >
              ✕
            </button>
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-4 text-gray-800">{modalTitle}</h3>
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