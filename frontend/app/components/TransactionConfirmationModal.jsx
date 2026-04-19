'use client'
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Pencil } from 'lucide-react';
import {
  coerceToDateDmy,
  coerceToTime12h,
  isValidDateDmy,
  isValidTime12h,
  normalizeTimeTo12hInput,
  sanitizeDateDmyInput,
} from '../../lib/datetime';

export function TransactionConfirmationModal({
  isOpen,
  extractedData,
  onConfirm,
  onDiscard,
  isSaving = false,
  errorMessage = ''
}) {
  const normalizeExtractedData = (data) => {
    const src = data && typeof data === 'object' ? data : {};
    const lowered = {};
    for (const [key, value] of Object.entries(src)) {
      if (typeof key === 'string') lowered[key.toLowerCase()] = value;
    }

    return {
      ...src,
      amount: lowered.amount ?? src.amount,
      date: coerceToDateDmy(lowered.date ?? src.date),
      time: coerceToTime12h(lowered.time ?? src.time),
      receiver: lowered.receiver ?? src.receiver,
      sender: lowered.sender ?? src.sender,
      category: lowered.category ?? src.category,
      transaction_id:
        lowered.transaction_id ?? src.transaction_id ?? lowered.transactionid ?? src.transactionId ?? src.transactionID,
    };
  };

  const normalizedExtractedData = normalizeExtractedData(extractedData);

  const firstMissingField = (() => {
    const data = normalizedExtractedData || {};
    const candidates = ["amount", "date", "time", "sender", "receiver"];
    for (const field of candidates) {
      const value = data[field];
      if (value === null || value === undefined) return field;
      if (typeof value === "string" && !value.trim()) return field;
      if (value === "Not found") return field;
    }
    return null;
  })();

  const [editedData, setEditedData] = useState(() =>
    extractedData ? { ...normalizedExtractedData, corrected: false } : null
  );
  const [validationErrors, setValidationErrors] = useState({});
  const [warnings, setWarnings] = useState({});

  const getConfidence = (field) => {
    if (!editedData || !editedData.confidence) return 1.0;
    return editedData.confidence[field] ?? 1.0;
  };

  const isLowConfidence = (field) => getConfidence(field) < 0.7;

  const validateFields = (field, value) => {
    const errors = {};
    const warns = {};

    if (field === 'amount') {
      const numValue = Number(value);
      if (!Number.isFinite(numValue) || numValue <= 0) {
        errors[field] = 'Amount must be a positive number.';
      } else if (numValue > 100000) {
        warns[field] = 'Large amount detected - please verify';
      }
    }

    if (field === 'date') {
      const raw = String(value || '').trim();
      if (!raw) errors[field] = 'Use DD/MM/YYYY';
      else if (!isValidDateDmy(raw)) errors[field] = 'Use DD/MM/YYYY';
    }

    if (field === 'time') {
      const raw = String(value || '').trim();
      if (!raw) errors[field] = 'Use HH:MM AM/PM';
      else if (!isValidTime12h(raw)) errors[field] = 'Use HH:MM AM/PM';
    }

    if (field === 'sender' || field === 'receiver') {
      const text = String(value || '').trim();
      if (text && text.length < 3) {
        errors[field] = 'Must be at least 3 characters.';
      }
    }

    if (field === 'transaction_id') {
      const text = String(value || '').trim();
      if (text && text.toLowerCase() !== 'not found' && text.length < 4) {
        errors[field] = 'Transaction ID must be at least 4 characters';
      }
    }

    return { errors, warns };
  };

  const handleInputChange = (field, value, { validate = true } = {}) => {
    const nextValue =
      field === 'date'
        ? sanitizeDateDmyInput(value)
        : field === 'time'
          ? normalizeTimeTo12hInput(value)
          : field === 'amount'
            ? String(value || '').replace(/,/g, '').replace(/[^\d.\-]/g, '')
            : value;

    const isManualCorrection = field === 'category' && nextValue !== extractedData?.category;

    setEditedData((prev) => ({
      ...(prev || {}),
      [field]: nextValue,
      corrected: isManualCorrection || Boolean(prev?.corrected)
    }));

    if (!validate) return;

    const { errors, warns } = validateFields(field, nextValue);
    setValidationErrors((prev) => ({ ...prev, [field]: errors[field] }));
    setWarnings((prev) => ({ ...prev, [field]: warns[field] }));
  };

  const handleConfirm = () => {
    const allErrors = {};
    const allWarnings = {};

    const required = ["amount", "date", "time", "category"];
    required.forEach((field) => {
      const { errors, warns } = validateFields(field, editedData?.[field]);
      if (errors[field]) allErrors[field] = errors[field];
      if (warns[field]) allWarnings[field] = warns[field];
    });

    setValidationErrors(allErrors);
    setWarnings(allWarnings);

    if (Object.keys(allErrors).length === 0) {
      onConfirm(editedData);
    }
  };

  const renderField = (field, label) => {
    const hasError = validationErrors[field];
    const lowConfidence = isLowConfidence(field);
    const confidenceScore = editedData.confidence?.[field]
      ? (editedData.confidence[field] * 100).toFixed(0)
      : null;

    const rawValue = editedData[field] ?? '';
    const trimmed = String(rawValue || '').trim();
    const isDateOrTime = field === 'date' || field === 'time';
    const isValid =
      field === 'date' ? isValidDateDmy(trimmed) : field === 'time' ? isValidTime12h(trimmed) : true;

    const borderClass =
      isDateOrTime && trimmed
        ? (isValid ? (lowConfidence ? 'border-amber-300' : 'border-slate-200') : 'border-red-400')
        : hasError
          ? 'border-red-400'
          : lowConfidence
            ? 'border-amber-300'
            : 'border-slate-200';

    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
              {label}
              <Pencil className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            </label>
            {field !== 'category' && lowConfidence && (
              <span className="bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full text-[10px] font-semibold">
                Low Confidence
              </span>
            )}
            {field === 'category' && confidenceScore && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                lowConfidence ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
              }`}>
                ML Confidence: {confidenceScore}%
              </span>
            )}
          </div>
        </div>

        <div className="relative">
          <input
            type={field === 'amount' ? 'text' : 'text'}
            value={rawValue}
            inputMode={field === 'date' ? 'numeric' : field === 'amount' ? 'decimal' : undefined}
            pattern={field === 'amount' ? '[0-9]*[.,]?[0-9]*' : undefined}
            placeholder={field === 'date' ? 'DD/MM/YYYY' : field === 'time' ? 'HH:MM AM/PM' : undefined}
            onChange={(e) => handleInputChange(field, e.target.value, { validate: true })}
            onBlur={() => handleInputChange(field, editedData[field] || '', { validate: true })}
            className={`w-full px-3 py-2 pr-10 border rounded-2xl bg-white focus:outline-none focus:ring-2 focus:ring-[#1e293b]/25 text-slate-900 ${borderClass}`}
            autoFocus={field === firstMissingField}
          />
        </div>

        {hasError && <p className="text-[11px] text-rose-600 mt-1">{hasError}</p>}
        {warnings[field] && <p className="text-[11px] text-amber-700 mt-1">{warnings[field]}</p>}
      </div>
    );
  };

  const portalTarget =
    typeof document !== 'undefined' ? document.getElementById('modal-root') || document.body : null;
  const isReady = Boolean(isOpen && extractedData && editedData && portalTarget);

  if (!isReady) return null;

  const amountValue = Number(editedData?.amount);
  const isAmountValid = Number.isFinite(amountValue) && amountValue > 0;
  const isDateValid = isValidDateDmy(editedData?.date);
  const isTimeValid = isValidTime12h(editedData?.time);

  const isConfirmDisabled =
    isSaving || !isAmountValid || !isDateValid || !isTimeValid || !String(editedData?.category || '').trim();

  const modalUi = (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 z-[10000]">
      <div className="bg-white/90 backdrop-blur border border-white/70 rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-slate-200/70">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Confirm Details</h2>
              <p className="text-sm text-slate-500">Verify information extracted by AI</p>
            </div>
            <button
              onClick={onDiscard}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
              disabled={isSaving}
              aria-label="Close"
            >
              x
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {renderField("amount", "Amount (INR)")}
            {renderField("category", "Category")}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {renderField("date", "Date")}
            {renderField("time", "Time")}
          </div>
          {renderField("sender", "Sender")}
          {renderField("receiver", "Receiver")}
          {renderField("transaction_id", "Transaction ID")}
        </div>

        <div className="p-6 bg-slate-50/70 rounded-b-3xl border-t border-slate-200/70">
          {errorMessage && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800">
              {errorMessage}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleConfirm}
              disabled={isConfirmDisabled}
              className="flex-1 bg-slate-900 text-white py-2.5 px-4 rounded-2xl font-semibold hover:bg-slate-800 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? 'Processing...' : 'Confirm & Save'}
            </button>
            <button
              onClick={onDiscard}
              disabled={isSaving}
              className="flex-1 bg-white text-slate-700 py-2.5 px-4 rounded-2xl font-semibold border border-slate-200 hover:bg-slate-50 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              Discard
            </button>
          </div>

          {Object.values(editedData.confidence || {}).some((v) => v < 0.7) && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-2">
              <span className="text-amber-600">!</span>
              <p className="text-xs text-amber-800 leading-relaxed">
                Some fields have low confidence or warnings. Please ensure the category and amounts are correct.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalUi, portalTarget);
}
