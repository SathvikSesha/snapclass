from dataclasses import dataclass

from app.config import settings
from app.rag.ingestion.document_extractor import (
    DocumentExtractionResult,
    ExtractedSection,
)


@dataclass
class TextChunk:
    text: str
    source: str
    location: str
    extraction_method: str
    chunk_index: int
    document_id: str | None = None
    subject_id: str | None = None


def split_text(
    text: str,
    chunk_size: int,
    overlap: int,
) -> list[str]:
    """
    Split text into character-based chunks.

    Tries to split at a whitespace boundary instead of
    cutting a word in half.
    """

    if chunk_size <= 0:
        raise ValueError("chunk_size must be greater than zero")

    if overlap < 0:
        raise ValueError("overlap cannot be negative")

    if overlap >= chunk_size:
        raise ValueError("overlap must be smaller than chunk_size")

    text = text.strip()

    if not text:
        return []

    if len(text) <= chunk_size:
        return [text]

    chunks = []
    start = 0

    while start < len(text):
        end = min(start + chunk_size, len(text))

        # If this isn't the final chunk, look for a
        # whitespace boundary near the end of the chunk.
        if end < len(text):
            minimum_boundary = start + int(chunk_size * 0.7)

            boundary = text.rfind(" ", minimum_boundary, end)

            if boundary == -1:
                boundary = text.rfind("\n", minimum_boundary, end)

            if boundary > start:
                end = boundary

        chunk = text[start:end].strip()

        if chunk:
            chunks.append(chunk)

        if end >= len(text):
            break

        # Move forward while retaining some previous text.
        next_start = end - overlap

        # Safety check to guarantee forward progress.
        if next_start <= start:
            next_start = end

        start = next_start

    return chunks


def chunk_document(
    result: DocumentExtractionResult,
    chunk_size: int = settings.CHUNK_SIZE,
    overlap: int = settings.CHUNK_OVERLAP,
    document_id: str | None = None,
    subject_id: str | None = None,
) -> list[TextChunk]:
    """
    Convert an extracted document into searchable text chunks.
    """

    chunks: list[TextChunk] = []

    for section in result.sections:
        section_chunks = split_text(
            text=section.text,
            chunk_size=chunk_size,
            overlap=overlap,
        )

        for chunk_text in section_chunks:
            chunks.append(
                TextChunk(
                    text=chunk_text,
                    source=section.source,
                    location=section.location,
                    extraction_method=section.extraction_method,
                    chunk_index=len(chunks),
                    document_id=document_id,
                    subject_id=subject_id,
                )
            )

    return chunks