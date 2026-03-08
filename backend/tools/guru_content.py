import os
import json
import uuid
from typing import List, Dict, Optional

try:
    import PyPDF2
except Exception:
    PyPDF2 = None

try:
    import pdfplumber
except Exception:
    pdfplumber = None

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECT_ROOT = os.path.dirname(BASE_DIR)
DATA_DIR = os.path.join(PROJECT_ROOT, 'data')
GURU_DIR = os.path.join(DATA_DIR, 'guru_docs')

os.makedirs(GURU_DIR, exist_ok=True)


def _safe_slug(value: str) -> str:
    value = value.strip().lower().replace(' ', '_')
    allowed = []
    for ch in value:
        if ch.isalnum() or ch in ['_', '-']:
            allowed.append(ch)
    return ''.join(allowed) or 'doc'


def _extract_text_from_pdf(path: str) -> str:
    # Prefer PyPDF2 if available, fallback to pdfplumber
    if PyPDF2 is not None:
        text_parts = []
        with open(path, 'rb') as f:
            reader = PyPDF2.PdfReader(f)
            for page in reader.pages:
                page_text = page.extract_text() or ''
                if page_text:
                    text_parts.append(page_text)
        return '\n'.join(text_parts).strip()
    if pdfplumber is not None:
        text_parts = []
        with pdfplumber.open(path) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text() or ''
                if page_text:
                    text_parts.append(page_text)
        return '\n'.join(text_parts).strip()
    raise RuntimeError('No PDF parser available (PyPDF2 or pdfplumber).')


def _extract_text_from_file(path: str) -> str:
    ext = os.path.splitext(path)[1].lower()
    if ext == '.pdf':
        return _extract_text_from_pdf(path)
    # treat everything else as text
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        return f.read().strip()


def _chunk_text(text: str, max_chars: int = 800) -> List[str]:
    if not text:
        return []
    chunks = []
    start = 0
    length = len(text)
    while start < length:
        end = min(start + max_chars, length)
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        start = end
    return chunks


def _index_path(user_id: str) -> str:
    return os.path.join(GURU_DIR, user_id, 'index.json')


def _load_index(user_id: str) -> List[Dict]:
    path = _index_path(user_id)
    if not os.path.exists(path):
        return []
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def _save_index(user_id: str, records: List[Dict]) -> None:
    os.makedirs(os.path.dirname(_index_path(user_id)), exist_ok=True)
    with open(_index_path(user_id), 'w', encoding='utf-8') as f:
        json.dump(records, f, indent=2)


def ingest_guru_document(user_id: str, guru: str, file_path: str, title: Optional[str] = None) -> Dict:
    guru_slug = _safe_slug(guru)
    doc_id = str(uuid.uuid4())
    ext = os.path.splitext(file_path)[1].lower()
    safe_title = _safe_slug(title or os.path.basename(file_path))

    user_dir = os.path.join(GURU_DIR, user_id, guru_slug)
    os.makedirs(user_dir, exist_ok=True)

    stored_name = f'{safe_title}_{doc_id}{ext}'
    stored_path = os.path.join(user_dir, stored_name)
    if os.path.abspath(file_path) != os.path.abspath(stored_path):
        os.replace(file_path, stored_path)

    text = _extract_text_from_file(stored_path)
    chunks = _chunk_text(text)

    chunks_path = os.path.join(user_dir, f'{safe_title}_{doc_id}.chunks.json')
    with open(chunks_path, 'w', encoding='utf-8') as f:
        json.dump(chunks, f)

    record = {
        'id': doc_id,
        'guru': guru,
        'guru_slug': guru_slug,
        'title': title or os.path.basename(file_path),
        'file_path': stored_path,
        'chunks_path': chunks_path,
        'chunk_count': len(chunks)
    }

    index = _load_index(user_id)
    index.append(record)
    _save_index(user_id, index)

    return record


def list_guru_documents(user_id: str, guru: Optional[str] = None) -> List[Dict]:
    records = _load_index(user_id)
    if guru:
        gslug = _safe_slug(guru)
        records = [r for r in records if r.get('guru_slug') == gslug]
    return records


def _score_chunk(chunk: str, terms: List[str]) -> int:
    if not chunk:
        return 0
    text = chunk.lower()
    score = 0
    for term in terms:
        if term and term in text:
            score += 1
    return score


def get_guru_snippets(user_id: str, guru: str, query: str, limit: int = 3) -> List[str]:
    records = list_guru_documents(user_id, guru=guru)
    if not records:
        return []

    terms = [t.strip().lower() for t in query.split() if len(t.strip()) > 2]
    candidates = []

    for record in records:
        chunks_path = record.get('chunks_path')
        if not chunks_path or not os.path.exists(chunks_path):
            continue
        with open(chunks_path, 'r', encoding='utf-8') as f:
            chunks = json.load(f)
        for chunk in chunks:
            score = _score_chunk(chunk, terms)
            if score > 0:
                candidates.append((score, chunk))

    if not candidates:
        return []

    candidates.sort(key=lambda x: x[0], reverse=True)
    top = [c[1] for c in candidates[:limit]]
    return top
