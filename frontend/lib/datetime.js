export const DATE_DMY_REGEX = /^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[0-2])\/(19|20)\d\d$/;
export const TIME_12H_REGEX = /^(0[1-9]|1[0-2]):[0-5][0-9] (AM|PM)$/;

export function formatDateDmy(value) {
  const dt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dt.getTime())) return '';
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yyyy = String(dt.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

export function formatTime12h(value) {
  const dt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dt.getTime())) return '';
  const hour24 = dt.getHours();
  const minute = dt.getMinutes();
  const ampm = hour24 < 12 ? 'AM' : 'PM';
  const hour12 = ((hour24 + 11) % 12) + 1;
  return `${String(hour12).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${ampm}`;
}

export function sanitizeDateDmyInput(rawValue) {
  const digits = String(rawValue || '').replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function isValidDateDmy(value, { disallowFuture = true } = {}) {
  const raw = String(value || '').trim();
  if (!DATE_DMY_REGEX.test(raw)) return false;
  const [dd, mm, yyyy] = raw.split('/').map((part) => Number(part));
  if (!dd || !mm || !yyyy) return false;
  const dt = new Date(yyyy, mm - 1, dd);
  if (dt.getFullYear() !== yyyy || dt.getMonth() !== mm - 1 || dt.getDate() !== dd) return false;
  if (!disallowFuture) return true;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  dt.setHours(0, 0, 0, 0);
  return dt.getTime() <= today.getTime();
}

export function normalizeTimeTo12hInput(rawValue) {
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
  return raw
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace('.', ':')
    .replace(/(\d)(AM|PM)\b/, '$1 $2');
}

export function isValidTime12h(value) {
  return TIME_12H_REGEX.test(String(value || '').trim());
}

export function coerceToDateDmy(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.toLowerCase() === 'not found') return raw;
  if (isValidDateDmy(raw, { disallowFuture: false })) return raw;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;

  const dmyDash = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dmyDash) return `${dmyDash[1]}/${dmyDash[2]}/${dmyDash[3]}`;

  return raw;
}

export function coerceToTime12h(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.toLowerCase() === 'not found') return raw;
  const normalized = normalizeTimeTo12hInput(raw);
  return isValidTime12h(normalized) ? normalized : raw;
}

export function parseTransactionDateTime(tx) {
  const dateRaw = String(tx?.date ?? '').trim();
  const timeRaw = String(tx?.time ?? '').trim();

  if (!dateRaw) return null;

  let year;
  let month;
  let day;

  let m = dateRaw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) {
    day = Number(m[1]);
    month = Number(m[2]);
    year = Number(m[3]);
  } else {
    m = dateRaw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      year = Number(m[1]);
      month = Number(m[2]);
      day = Number(m[3]);
    } else {
      m = dateRaw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
      if (m) {
        day = Number(m[1]);
        month = Number(m[2]);
        year = Number(m[3]);
      }
    }
  }

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    const parsed = new Date(dateRaw);
    if (Number.isNaN(parsed.getTime())) return null;
    year = parsed.getFullYear();
    month = parsed.getMonth() + 1;
    day = parsed.getDate();
  }

  let hours = 0;
  let minutes = 0;

  if (timeRaw) {
    const normalized = normalizeTimeTo12hInput(timeRaw);
    if (isValidTime12h(normalized)) {
      const t = normalized.match(/^(\d{2}):(\d{2}) (AM|PM)$/);
      if (t) {
        let hour12 = Number(t[1]);
        const minute = Number(t[2]);
        const ampm = t[3];
        if (ampm === 'AM') hour12 = hour12 === 12 ? 0 : hour12;
        else hour12 = hour12 === 12 ? 12 : hour12 + 12;
        hours = hour12;
        minutes = minute;
      }
    } else {
      const timeParts = timeRaw.split(':').map((p) => p.trim());
      if (timeParts.length >= 2) {
        const h = Number(timeParts[0]);
        const minOnly = String(timeParts[1]).replace(/[^\d]/g, '');
        const minute = Number(minOnly);
        hours = Number.isFinite(h) ? h : 0;
        minutes = Number.isFinite(minute) ? minute : 0;
      }
    }
  }

  const asDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
  return Number.isNaN(asDate.getTime()) ? null : asDate;
}
