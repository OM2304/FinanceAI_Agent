import os
import json
import uuid
import time
from typing import List, Dict, Optional

from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_chroma import Chroma
from google import genai

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
VECTOR_DB_DIR = os.path.join(DATA_DIR, 'guru_vector_db')

os.makedirs(GURU_DIR, exist_ok=True)
os.makedirs(VECTOR_DB_DIR, exist_ok=True)


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

def _get_vector_db(user_id: str) -> Chroma:
    """Get (or create) a Chroma collection for a user."""
    embeddings = GoogleGenerativeAIEmbeddings(model="models/gemini-embedding-001")
    collection_name = f"guru_{user_id}"
    return Chroma(
        collection_name=collection_name,
        embedding_function=embeddings,
        persist_directory=VECTOR_DB_DIR,
    )

def _chunk_id(user_id: str, doc_id: str, chunk_index: int) -> str:
    """Deterministic chunk id to avoid duplicates across migrations."""
    return f"{user_id}:{doc_id}:{chunk_index}"

def migrate_json_to_vector_db() -> Dict[str, int]:
    """
    Migrate existing *.chunks.json files into the vector DB.
    Returns a summary dict with counts.
    """
    migrated = 0
    skipped = 0
    errors = 0

    if not os.path.exists(GURU_DIR):
        return {"migrated": 0, "skipped": 0, "errors": 0}

    # Scan all user folders under data/guru_docs/
    for user_id in os.listdir(GURU_DIR):
        user_path = os.path.join(GURU_DIR, user_id)
        if not os.path.isdir(user_path):
            continue

        # Load index to map doc_id -> metadata
        records = _load_index(user_id)
        record_map = {r.get("id"): r for r in records if r.get("id")}

        # Walk user folder to find chunks.json
        for root, _dirs, files in os.walk(user_path):
            for fname in files:
                if not fname.endswith(".chunks.json"):
                    continue

                chunks_path = os.path.join(root, fname)

                # Try to extract doc_id from filename: <safe_title>_<doc_id>.chunks.json
                doc_id = None
                base = fname[:-len(".chunks.json")]
                if "_" in base:
                    doc_id = base.split("_")[-1]

                record = record_map.get(doc_id) if doc_id else None
                guru_name = record.get("guru") if record else None
                guru_slug = record.get("guru_slug") if record else None
                doc_title = record.get("title") if record else base

                try:
                    with open(chunks_path, 'r', encoding='utf-8') as f:
                        chunks = json.load(f) or []
                except Exception:
                    errors += 1
                    continue

                if not chunks:
                    continue

                vectordb = _get_vector_db(user_id)
                texts = []
                metadatas = []
                ids = []

                # Build ids and metadata
                for idx, chunk in enumerate(chunks):
                    cid = _chunk_id(user_id, doc_id or "unknown", idx)
                    ids.append(cid)
                    texts.append(chunk)
                    metadatas.append({
                        "user_id": user_id,
                        "doc_id": doc_id or "unknown",
                        "guru": guru_name or "Unknown",
                        "guru_slug": guru_slug or _safe_slug(guru_name or "unknown"),
                        "title": doc_title or "Unknown",
                        "chunk_index": idx,
                        "source": "migration",
                    })

                # Prevent duplicates: add only missing ids
                try:
                    existing = set()
                    # Chroma supports id lookup via collection.get
                    existing_result = vectordb._collection.get(ids=ids)
                    for existing_id in existing_result.get("ids", []) or []:
                        existing.add(existing_id)
                except Exception:
                    existing = set()

                new_texts = []
                new_metadatas = []
                new_ids = []
                for text, meta, cid in zip(texts, metadatas, ids):
                    if cid in existing:
                        skipped += 1
                        continue
                    new_texts.append(text)
                    new_metadatas.append(meta)
                    new_ids.append(cid)

                if new_texts:
                    try:
                        vectordb.add_texts(new_texts, metadatas=new_metadatas, ids=new_ids)
                        migrated += len(new_texts)
                        time.sleep(1)
                    except Exception as e:
                        errors += len(new_texts)
                        print(f"GURU MIGRATION WARNING: embedding failed for {chunks_path}: {e}")
                
                time.sleep(1)

    return {"migrated": migrated, "skipped": skipped, "errors": errors}

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

    # Store chunks in vector DB instead of chunks.json
    vectordb = _get_vector_db(user_id)
    metadatas = []
    for idx, chunk in enumerate(chunks):
        metadatas.append({
            "doc_id": doc_id,
            "guru": guru,
            "guru_slug": guru_slug,
            "title": title or os.path.basename(file_path),
            "chunk_index": idx,
        })
    if chunks:
        vectordb.add_texts(chunks, metadatas=metadatas)

    record = {
        'id': doc_id,
        'guru': guru,
        'guru_slug': guru_slug,
        'title': title or os.path.basename(file_path),
        'file_path': stored_path,
        'chunk_count': len(chunks),
        'vector_collection': f"guru_{user_id}",
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
    vectordb = _get_vector_db(user_id)
    results = vectordb.similarity_search(
        query,
        k=limit,
        filter={"guru_slug": _safe_slug(guru)}
    )
    return [r.page_content for r in results]


def query_guru_advice(user_query: str, user_id: str) -> List[str]:
    """
    Perform similarity search in the user's vector DB and return top 3 snippets.
    """
    if not user_query or not user_id:
        return []
    vectordb = _get_vector_db(user_id)
    results = vectordb.similarity_search(user_query, k=3)
    return [r.page_content for r in results]
