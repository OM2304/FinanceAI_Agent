'use client'
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TransactionConfirmationModal } from './TransactionConfirmationModal';
import { confirmTransaction, uploadCsvTransactions } from '../../lib/api';
import { createClient } from '../../lib/supabase/client';

export function UploadComponent({ onUploadSuccess }) { // <--- Receive Prop
  const [status, setStatus] = useState("idle");
  const [password, setPassword] = useState("");
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [message, setMessage] = useState("");
  const [extractedData, setExtractedData] = useState(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeSource, setActiveSource] = useState("ocr");
  const [manualData, setManualData] = useState({
    amount: '',
    receiver: '',
    sender: 'Self',
    date: '',
    time: '',
    category: 'Other',
    transaction_id: ''
  });
  const [csvFile, setCsvFile] = useState(null);
  const [csvResult, setCsvResult] = useState(null);
  const router = useRouter();

  const normalizeDateInput = (value) => {
    if (!value) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const match = value.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
    if (!match) return value;
    const [, dd, mm, yyyy] = match;
    return `${yyyy}-${mm}-${dd}`;
  };

  function handleFileChange(event) {
    const file = event.target.files[0];
    setSelectedFile(file);
    setRequiresPassword(false);
    setPassword("");
    setMessage("");
  }

  function handleCsvChange(event) {
    const file = event.target.files[0];
    setCsvFile(file);
    setCsvResult(null);
    setMessage("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus("uploading");
    setMessage("");
    
    const formData = new FormData();
    formData.append('file', selectedFile);
    if (password) {
      formData.append('password', password);
    }

    try {
      const token = localStorage.getItem('sb-token');
      if (!token) {
        router.push('/login');
        return;
      }

      const response = await fetch('http://localhost:8000/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData,
      });

      if (response.status === 401) {
        localStorage.removeItem('sb-token');
        router.push('/login');
        return;
      }

      const data = await response.json();

      if (data.requires_password) {
        setRequiresPassword(true);
        setStatus("idle");
        setMessage("🔐 This PDF requires a password. Please enter it below.");
      } else if (data.success && data.extracted_data) {
        // Show confirmation modal with extracted data
        setExtractedData(data.extracted_data);
        setShowConfirmation(true);
        setStatus("idle");
        setMessage("");
        // Reset file input
        event.target.reset();
      } else if (data.success || (data.status && data.status.includes("✅"))) {
        // Fallback for PDF or other success cases
        setStatus("success");
        setMessage(data.status || "✅ File processed successfully!");
        setRequiresPassword(false);
        setPassword("");
        setSelectedFile(null);
        event.target.reset();
        
        // --- KEY FIX: Call the parent refresh function ---
        if (onUploadSuccess) onUploadSuccess();
        router.refresh();
        
        setTimeout(() => {
          setStatus("idle");
          setMessage("");
        }, 3000);
      } else {
        setStatus("error");
        setMessage(data.status || "❌ Failed to process file");
      }
    } catch (error) {
      console.error(error);
      setStatus("error");
      setMessage("❌ Error connecting to server");
    }
  }

  const handleManualSubmit = async (event) => {
    event.preventDefault();
    try {
      const token = localStorage.getItem('sb-token');
      if (!token) {
        router.push('/login');
        return;
      }
      setStatus("uploading");
      setMessage("Saving transaction...");
      const payload = {
        ...manualData,
        amount: Number(manualData.amount || 0)
      };
      if (!payload.amount || !payload.receiver) {
        setStatus("error");
        setMessage("Amount and receiver are required.");
        return;
      }
      if (!payload.date) {
        payload.date = new Date().toISOString().slice(0, 10);
      }
      if (!payload.time) {
        const now = new Date();
        payload.time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      }
      await confirmTransaction(payload, token);
      setStatus("success");
      setMessage("✅ Transaction saved successfully!");
      setManualData({
        amount: '',
        receiver: '',
        sender: 'Self',
        date: '',
        time: '',
        category: 'Other',
        transaction_id: ''
      });
      if (onUploadSuccess) onUploadSuccess();
      router.refresh();
      setTimeout(() => {
        setStatus("idle");
        setMessage("");
      }, 3000);
    } catch (error) {
      setStatus("error");
      setMessage(`❌ Failed to save: ${error.message || "Unknown error"}`);
    }
  };

  const handleCsvSubmit = async (event) => {
    event.preventDefault();
    try {
      const token = localStorage.getItem('sb-token');
      if (!token) {
        router.push('/login');
        return;
      }
      if (!csvFile) {
        setStatus("error");
        setMessage("Please choose a CSV file.");
        return;
      }
      setStatus("uploading");
      setMessage("Importing CSV...");
      const res = await uploadCsvTransactions(csvFile, token);
      setCsvResult(res);
      setStatus("success");
      setMessage(`✅ Imported ${res.inserted} transactions`);
      if (onUploadSuccess) onUploadSuccess();
      router.refresh();
      setTimeout(() => {
        setStatus("idle");
        setMessage("");
      }, 3000);
    } catch (error) {
      setStatus("error");
      setMessage(`❌ CSV import failed: ${error.message || "Unknown error"}`);
    }
  };

  const handleConfirmTransaction = async (confirmedData) => {
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        alert("Please login first");
        return;
      }

      setIsSaving(true);
      setStatus("uploading");
      setMessage("Saving transaction...");
      
      // Remove confidence scores before sending (not needed for saving)
      const { confidence, ...dataToSave } = confirmedData;
      
      console.log("Saving transaction:", dataToSave);
      
      const result = await confirmTransaction(dataToSave, session.access_token);
      console.log("Save result:", result);
      
      setShowConfirmation(false);
      setExtractedData(null);
      setIsSaving(false);
      setStatus("success");
      setMessage("✅ Transaction saved successfully!");
      
      // --- KEY FIX: Call the parent refresh function ---
      if (onUploadSuccess) onUploadSuccess();
      router.refresh();

      setTimeout(() => {
        setStatus("idle");
        setMessage("");
      }, 3000);
    } catch (error) {
      console.error("Error saving transaction:", error);
      setIsSaving(false);
      setStatus("error");
      setMessage(`❌ Failed to save: ${error.message || "Unknown error"}`);
      // Keep modal open so user can try again
    }
  };

  // ... rest of the component (handleDiscardTransaction and return) remains the same
  const handleDiscardTransaction = () => {
    setShowConfirmation(false);
    setExtractedData(null);
    setStatus("idle");
    setMessage("Transaction discarded");
    setTimeout(() => {
      setMessage("");
    }, 2000);
  };

  return (
    <>
    <div className="mb-6 flex flex-wrap gap-2">
      {[
        { key: 'ocr', label: 'Screenshot / PDF' },
        { key: 'manual', label: 'Manual Entry' },
        { key: 'csv', label: 'CSV Upload' }
      ].map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => {
            setActiveSource(tab.key);
            setMessage("");
            setCsvResult(null);
          }}
          className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all ${
            activeSource === tab.key
              ? 'bg-slate-900 text-white'
              : 'bg-white text-slate-600 border border-slate-200 hover:text-slate-900'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>

    {activeSource === "ocr" && (
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex gap-4 items-center">
          <input 
            type="file" 
            name="file" 
            accept="image/*,.pdf"
            onChange={handleFileChange}
            required
            className="block w-full text-sm text-gray-700 bg-white border border-gray-300 rounded-lg p-3
              file:mr-4 file:py-2 file:px-4
              file:rounded-lg file:border-0
              file:text-sm file:font-semibold
              file:bg-blue-50 file:text-blue-700
              hover:file:bg-blue-100 cursor-pointer
              hover:border-blue-400 transition-colors"
          />
          <button 
            type="submit" 
            disabled={status === "uploading"}
            className="bg-slate-900 text-white px-6 py-2 rounded-2xl hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
          >
            {status === "uploading" ? "Processing..." : "Upload & Scan"}
          </button>
        </div>

        {requiresPassword && (
          <div className="flex gap-2 items-center p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter PDF password"
              className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={status === "uploading"}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              Submit
            </button>
          </div>
        )}
      </form>
    )}

    {activeSource === "manual" && (
      <form onSubmit={handleManualSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <input
          type="text"
          value={manualData.receiver}
          onChange={(e) => setManualData({ ...manualData, receiver: e.target.value })}
          placeholder="Receiver / Merchant"
          className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
        />
        <input
          type="number"
          value={manualData.amount}
          onChange={(e) => setManualData({ ...manualData, amount: e.target.value })}
          placeholder="Amount"
          className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
        />
        <input
          type="text"
          value={manualData.sender}
          onChange={(e) => setManualData({ ...manualData, sender: e.target.value })}
          placeholder="Sender"
          className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
        />
        <input
          type="text"
          value={manualData.category}
          onChange={(e) => setManualData({ ...manualData, category: e.target.value })}
          placeholder="Category"
          className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
        />
        <div className="space-y-2">
          <input
            type="text"
            value={manualData.date}
            onChange={(e) => setManualData({ ...manualData, date: normalizeDateInput(e.target.value) })}
            placeholder="Date (YYYY-MM-DD or DD-MM-YYYY)"
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
          />
          <p className="text-xs text-slate-500">Format: `YYYY-MM-DD` (preferred) or `DD-MM-YYYY`</p>
        </div>
        <div className="space-y-2">
          <input
            type="text"
            value={manualData.time}
            onChange={(e) => setManualData({ ...manualData, time: e.target.value })}
            placeholder="Time (HH:MM)"
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
          />
          <p className="text-xs text-slate-500">Format: `HH:MM` (24-hour)</p>
        </div>
        <input
          type="text"
          value={manualData.transaction_id}
          onChange={(e) => setManualData({ ...manualData, transaction_id: e.target.value })}
          placeholder="Transaction ID (optional)"
          className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
        />
        <div className="md:col-span-2 flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={() => {
              const now = new Date();
              setManualData({
                ...manualData,
                date: now.toISOString().slice(0, 10),
                time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
              });
            }}
            className="w-full sm:w-auto bg-white text-slate-700 px-4 py-2 rounded-2xl border border-slate-200 hover:bg-slate-50"
          >
            Use Current Date/Time
          </button>
          <button
            type="submit"
            disabled={status === "uploading"}
            className="w-full bg-slate-900 text-white px-6 py-2 rounded-2xl hover:bg-slate-800 disabled:opacity-50"
          >
            {status === "uploading" ? "Saving..." : "Save Manual Entry"}
          </button>
        </div>
      </form>
    )}

    {activeSource === "csv" && (
      <form onSubmit={handleCsvSubmit} className="space-y-4">
        <input
          type="file"
          name="csvfile"
          accept=".csv"
          onChange={handleCsvChange}
          required
          className="block w-full text-sm text-gray-700 bg-white border border-gray-300 rounded-lg p-3
            file:mr-4 file:py-2 file:px-4
            file:rounded-lg file:border-0
            file:text-sm file:font-semibold
            file:bg-blue-50 file:text-blue-700
            hover:file:bg-blue-100 cursor-pointer
            hover:border-blue-400 transition-colors"
        />
        <button
          type="submit"
          disabled={status === "uploading"}
          className="bg-slate-900 text-white px-6 py-2 rounded-2xl hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
        >
          {status === "uploading" ? "Importing..." : "Import CSV"}
        </button>
        {csvResult && (
          <div className="text-sm text-slate-600">
            Imported {csvResult.inserted} rows. Errors: {csvResult.errors?.length || 0}
          </div>
        )}
        <div className="text-xs text-slate-500">
          CSV columns supported: amount, receiver/description, date, time, category, sender, transaction_id.
        </div>
      </form>
    )}

      {message && (
        <div className={`p-3 rounded-lg mt-4 ${
          status === "success" ? "bg-green-50 text-green-700 border border-green-200" :
          status === "error" ? "bg-red-50 text-red-700 border border-red-200" :
          "bg-yellow-50 text-yellow-700 border border-yellow-200"
        }`}>
          {message}
        </div>
      )}

      {/* Confirmation Modal */}
      <TransactionConfirmationModal
        isOpen={showConfirmation}
        extractedData={extractedData}
        onConfirm={handleConfirmTransaction}
        onDiscard={handleDiscardTransaction}
        isSaving={isSaving}
      />
    </>
  );
}
