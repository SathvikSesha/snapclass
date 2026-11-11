import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pathlib import Path

from app.rag.ingestion.document_extractor import (
    extract_document,
)


SAMPLE_FOLDER = Path(__file__).resolve().parent.parent / "sample_documents"

for file_path in SAMPLE_FOLDER.iterdir():

    if file_path.suffix.lower() not in {
        ".pdf",
        ".docx",
        ".pptx",
    }:
        continue

    print("\n" + "=" * 60)
    print("FILE:", file_path.name)

    try:
        sections = extract_document(file_path)

        total_characters = sum(
            len(section.text) for section in sections
        )

        print("Extracted sections:", len(sections))
        print("Total extracted characters:", total_characters)

        for section in sections:
            print("\nSource:", section.source)
            print("Location:", section.location)
            print("Text:", section.text[:300])

    except Exception as error:
        print("Extraction failed:", error)
