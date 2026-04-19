'use client'
import { useState } from 'react';
import { createPortal } from 'react-dom';

export function TransactionConfirmationModal({
  isOpen,
  extractedData,
  onConfirm,
  onDiscard,
  isSaving = false,
  errorMessage = ''
}) {
  const DATE_REGEX = /^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[012])\/(19|20)\d\d$/;
  const TIME_REGEX = /^(0[1-9]|1[0-2]):[0-5][0-9] (AM|PM)$/;

  const normalizeExtractedData = (data) => {
    const src = data && typeof data === 'object' ? data : {};
    const lowered = {};
    for (const [key, value] of Object.entries(src)) {
      if (typeof key === 'string') lowered[key.toLowerCase()] = value;
    }

    return {
      ...src,
      amount: lowered.amount ?? src.amount,
      date: lowered.date ?? src.date,
      time: lowered.time ?? src.time,
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
  const [editingField, setEditingField] = useState(() => firstMissingField);
  const [validationErrors, setValidationErrors] = useState({});
  const [warnings, setWarnings] = useState({});

  const getConfidence = (field) => {
    if (!editedData || !editedData.confidence) return 1.0;
    return editedData.confidence[field] ?? 1.0;
  };

  const isLowConfidence = (field) => getConfidence(field) < 0.7;

  const sanitizeDateInput = (rawValue) => {
    const digits = String(rawValue || '').replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  };

  const isValidDateDmy = (value) => {
    const raw = String(value || '').trim();
    if (!DATE_REGEX.test(raw)) return false;
    const [dd, mm, yyyy] = value.split('/').map((part) => Number(part));
    if (!dd || !mm || !yyyy) return false;
    if (mm < 1 || mm > 12) return false;
    if (dd < 1 || dd > 31) return false;
    const dt = new Date(yyyy, mm - 1, dd);
    return dt.getFullYear() === yyyy && dt.getMonth() === mm - 1 && dt.getDate() === dd;
  };

  const isValidTime = (value) => {
    const raw = String(value || '').trim();
    return TIME_REGEX.test(raw);
  };

  const normalizeTimeInput = (rawValue) => {
    const raw = String(rawValue || '').trim();
    if (!raw) return '';

    const compact = raw.toUpperCase().replace(/\s+/g, '').replace('.', ':');

    // 24-hour -> strict 12-hour.
    let m = compact.match(/^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
    if (m) {
      const hour24 = Number(m[1]);
      const minute = Number(m[2]);
      const ampm = hour24 < 12 ? 'AM' : 'PM';
      const hour12 = ((hour24 + 11) % 12) + 1;
      return `${String(hour12).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${ampm}`;
    }

    // 12-hour variants -> strict 12-hour.
    m = compact.match(/^(0?[1-9]|1[0-2]):([0-5]\d)(AM|PM)$/);
    if (m) {
      const hour = Number(m[1]);
      const minute = Number(m[2]);
      const ampm = m[3];
      return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${ampm}`;
    }

    // Best-effort: insert a space before AM/PM if missing.
    const spaced = raw.toUpperCase().replace(/\s+/g, ' ').replace('.', ':').replace(/(\d)(AM|PM)\b/, '$1 $2');
    return spaced;
  };

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
      if (!isValidDateDmy(String(value || ''))) {
        errors[field] = 'Use DD/MM/YYYY';
      }
    }

    if (field === 'time') {
      const raw = String(value || '').trim();
      if (!isValidTime(raw)) {
        errors[field] = 'Use HH:MM AM/PM';
      }
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
      field === 'date' ? sanitizeDateInput(value) : field === 'time' ? normalizeTimeInput(value) : value;

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
            <label className="text-sm font-medium text-slate-700">{label}</label>
            {field === 'category' && confidenceScore && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                lowConfidence ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
              }`}>
                ML Confidence: {confidenceScore}%
              </span>
            )}
            {field !== 'category' && lowConfidence && (
              <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-semibold">
                Low Confidence
              </span>
            )}
          </div>
          {!isEditing && (
            <button
              onClick={() => setEditingField(field)}
              className="text-xs text-slate-600 hover:text-slate-900 font-medium"
            >
              Edit
            </button>
          )}
        </div>

        {isEditing ? (
          <input
            type={field === 'amount' ? 'number' : 'text'}
            value={editedData[field] || ''}
            inputMode={field === 'date' ? 'numeric' : undefined}
            placeholder={field === 'date' ? 'DD/MM/YYYY' : field === 'time' ? 'HH:MM AM/PM' : undefined}
            onChange={(e) => handleInputChange(field, e.target.value, { validate: true })}
            onBlur={() => {
              handleInputChange(field, editedData[field] || '', { validate: true });
              setEditingField(null);
            }}
            className={`w-full px-3 py-2 border rounded-2xl focus:outline-none focus:ring-2 focus:ring-slate-900/20 text-slate-900 ${
              hasError ? 'border-rose-500' : hasWarning ? 'border-amber-500' : 'border-slate-200'
            }`}
            autoFocus
          />
        ) : (
          <div className={`p-2 border rounded-2xl transition-colors ${
            hasError ? 'border-rose-500 bg-rose-50' :
            hasWarning ? 'border-amber-500 bg-amber-50' :
            lowConfidence ? 'border-amber-300 bg-amber-50' :
            'border-slate-200 bg-slate-50'
          }`}>
            <span className={`text-sm ${
              hasError ? 'text-rose-700' : hasWarning ? 'text-amber-700' : 'text-slate-900'
            }`}>
              {editedData[field] || 'Not detected'}
            </span>
          </div>
        )}

        {hasError && <p className="text-[11px] text-rose-600 mt-1">{hasError}</p>}
        {hasWarning && <p className="text-[11px] text-amber-600 mt-1">{hasWarning}</p>}
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
  const isTimeValid = isValidTime(editedData?.time);

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

          {(Object.keys(warnings).some((k) => warnings[k]) || Object.values(editedData.confidence || {}).some((v) => v < 0.7)) && (
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
