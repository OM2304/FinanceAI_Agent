'use client'
import { useState, useEffect } from 'react';

export function TransactionConfirmationModal({
  isOpen,
  extractedData,
  onConfirm,
  onDiscard,
  isSaving = false
}) {
  const [editedData, setEditedData] = useState(null);
  const [editingField, setEditingField] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});
  const [warnings, setWarnings] = useState({});

  useEffect(() => {
    if (extractedData) {
      // Initialize editedData with the extracted data and a 'corrected' flag set to false
      setEditedData({ ...extractedData, corrected: false });
      setValidationErrors({});
      setWarnings({});
      setEditingField(null);
    }
  }, [extractedData]);

  const getConfidence = (field) => {
    if (!editedData || !editedData.confidence) return 1.0;
    return editedData.confidence[field] ?? 1.0;
  };

  const isLowConfidence = (field) => {
    return getConfidence(field) < 0.7;
  };

  const validateField = (field, value) => {
    const errors = {};
    const warns = {};
    
    if (field === 'amount') {
      const numValue = parseFloat(value);
      if (isNaN(numValue) || numValue <= 0) {
        errors[field] = 'Amount must be a positive number';
      } else if (numValue > 100000) {
        warns[field] = 'Large amount detected - please verify';
      }
    }
    
    if (field === 'sender' || field === 'receiver') {
      if (!value || value.trim().length < 2) {
        errors[field] = 'Name must be at least 2 characters';
      }
    }
    
    if (field === 'transaction_id') {
      if (!value || value.trim().length < 4) {
        errors[field] = 'Transaction ID must be at least 4 characters';
      }
    }
    
    return { errors, warns };
  };

  const handleFieldEdit = (field, value) => {
    // If user changes the category, we mark 'corrected' as true for the ML training loop
    const isManualCorrection = field === 'category' && value !== extractedData.category;
    
    const newData = { 
      ...editedData, 
      [field]: value, 
      corrected: isManualCorrection || editedData.corrected 
    };
    setEditedData(newData);
    
    const { errors, warns } = validateField(field, value);
    setValidationErrors(prev => ({ ...prev, [field]: errors[field] }));
    setWarnings(prev => ({ ...prev, [field]: warns[field] }));
  };

  const handleConfirm = () => {
    const allErrors = {};
    const allWarnings = {};
    
    Object.keys(editedData).forEach(field => {
      if (field !== 'confidence' && field !== 'corrected') {
        const { errors, warns } = validateField(field, editedData[field]);
        if (errors[field]) allErrors[field] = errors[field];
        if (warns[field]) allWarnings[field] = warns[field];
      }
    });
    
    setValidationErrors(allErrors);
    setWarnings(allWarnings);
    
    if (Object.keys(allErrors).length === 0) {
      onConfirm(editedData);
    }
  };

  const FieldDisplay = ({ field, label }) => {
    const isEditing = editingField === field;
    const hasError = validationErrors[field];
    const hasWarning = warnings[field];
    const lowConfidence = isLowConfidence(field);
    const confidenceScore = editedData.confidence?.[field] 
      ? (editedData.confidence[field] * 100).toFixed(0) 
      : null;
    
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">{label}</label>
            {/* Show ML Confidence badge specifically for Category per Track B requirements */}
            {field === 'category' && confidenceScore && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                lowConfidence ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
              }`}>
                ML Confidence: {confidenceScore}%
              </span>
            )}
            {field !== 'category' && lowConfidence && (
              <span className="text-[10px] bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded font-bold">
                Low Confidence
              </span>
            )}
          </div>
          {!isEditing && (
            <button
              onClick={() => setEditingField(field)}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              Edit
            </button>
          )}
        </div>
        
        {isEditing ? (
          <input
            type={field === 'amount' ? 'number' : 'text'}
            value={editedData[field] || ''}
            onChange={(e) => handleFieldEdit(field, e.target.value)}
            onBlur={() => setEditingField(null)}
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black ${
              hasError ? 'border-red-500' : hasWarning ? 'border-yellow-500' : 'border-gray-300'
            }`}
            autoFocus
          />
        ) : (
          <div className={`p-2 border rounded-md transition-colors ${
            hasError ? 'border-red-500 bg-red-50' : 
            hasWarning ? 'border-yellow-500 bg-yellow-50' : 
            lowConfidence ? 'border-yellow-300 bg-yellow-50' :
            'border-gray-200 bg-gray-50'
          }`}>
            <span className={`text-sm ${
              hasError ? 'text-red-700' : hasWarning ? 'text-yellow-700' : 'text-gray-900'
            }`}>
              {editedData[field] || 'Not detected'}
            </span>
          </div>
        )}
        
        {hasError && <p className="text-[11px] text-red-600 mt-1">{hasError}</p>}
        {hasWarning && <p className="text-[11px] text-yellow-600 mt-1">{hasWarning}</p>}
      </div>
    );
  };

  if (!isOpen || !extractedData || !editedData) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-gray-100">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Confirm Details</h2>
              <p className="text-sm text-gray-500">Verify information extracted by AI</p>
            </div>
            <button
              onClick={onDiscard}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
              disabled={isSaving}
            >
              <span className="text-xl">✕</span>
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FieldDisplay field="amount" label="Amount (₹)" />
            <FieldDisplay field="category" label="Category" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FieldDisplay field="date" label="Date" />
            <FieldDisplay field="time" label="Time" />
          </div>
          <FieldDisplay field="sender" label="Sender" />
          <FieldDisplay field="receiver" label="Receiver" />
          <FieldDisplay field="transaction_id" label="Transaction ID" />
        </div>

        <div className="p-6 bg-gray-50 rounded-b-xl border-t border-gray-100">
          <div className="flex gap-3">
            <button
              onClick={handleConfirm}
              disabled={isSaving || Object.keys(validationErrors).some(key => validationErrors[key])}
              className="flex-1 bg-blue-600 text-white py-2.5 px-4 rounded-lg font-bold hover:bg-blue-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
            >
              {isSaving ? 'Processing...' : 'Confirm & Save'}
            </button>
            <button
              onClick={onDiscard}
              disabled={isSaving}
              className="flex-1 bg-white text-gray-700 py-2.5 px-4 rounded-lg font-bold border border-gray-200 hover:bg-gray-50 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              Discard
            </button>
          </div>

          {(Object.keys(warnings).some(k => warnings[k]) || Object.values(editedData.confidence || {}).some(v => v < 0.7)) && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-2">
              <span className="text-yellow-600">⚠️</span>
              <p className="text-xs text-yellow-800 leading-relaxed">
                Some fields have <strong>low confidence</strong> or <strong>warnings</strong>. 
                Please ensure the category and amounts are correct to help train the AI model.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}