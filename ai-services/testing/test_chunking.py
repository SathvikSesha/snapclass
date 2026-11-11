import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pathlib import Path

from app.rag.ingestion.document_extractor import ingest_document
from app.rag.chunking.text_chunker import chunk_document


SAMPLE_FOLDER = Path(__file__).resolve().parent.parent / "sample_documents"

for file_path in SAMPLE_FOLDER.iterdir():

    if file_path.suffix.lower() not in {".pdf", ".docx", ".pptx"}:
        continue

    print("\n" + "=" * 70)
    print(f"DOCUMENT: {file_path.name}")
    print("=" * 70)

    try:
        # Step 1: Extract document content.
        extracted = ingest_document(file_path)

        # Step 2: Convert extracted sections into chunks.
        chunks = chunk_document(
            result=extracted,
            chunk_size=1500,
            overlap=200,
            document_id=file_path.stem,
            subject_id="sample-subject-001",
        )

        print(f"Extracted sections: {extracted.total_sections}")
        print(f"Generated chunks: {len(chunks)}")

        if chunks:
            chunk_lengths = [len(chunk.text) for chunk in chunks]

            print(f"Smallest chunk: {min(chunk_lengths)} characters")
            print(f"Largest chunk: {max(chunk_lengths)} characters")
            print(
                f"Average chunk: "
                f"{sum(chunk_lengths) / len(chunk_lengths):.2f} characters"
            )

        # Display the first three chunks.
        for chunk in chunks[:3]:
            print("\n" + "-" * 50)
            print(f"Chunk index: {chunk.chunk_index}")
            print(f"Source: {chunk.source}")
            print(f"Location: {chunk.location}")
            print(f"Extraction method: {chunk.extraction_method}")
            print(f"Document ID: {chunk.document_id}")
            print(f"Subject ID: {chunk.subject_id}")
            print(f"Text:\n{chunk.text}")

    except Exception as error:
        print(f"Chunking test failed for {file_path.name}: {error}")