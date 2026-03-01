'use client'
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TransactionConfirmationModal } from './TransactionConfirmationModal';
import { confirmTransaction } from '../../lib/api';
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
  const router = useRouter();

  function handleFileChange(event) {
    const file = event.target.files[0];
    setSelectedFile(file);
    setRequiresPassword(false);
    setPassword("");
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

      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const response = await fetch(`${API_URL}/upload`, {
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
          className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
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
      
      {message && (
        <div className={`p-3 rounded-lg ${
          status === "success" ? "bg-green-50 text-green-700 border border-green-200" :
          status === "error" ? "bg-red-50 text-red-700 border border-red-200" :
          "bg-yellow-50 text-yellow-700 border border-yellow-200"
        }`}>
          {message}
        </div>
      )}
    </form>

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