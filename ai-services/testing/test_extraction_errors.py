import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pathlib import Path

from app.rag.ingestion.document_extractor import (
    extract_document,
    DocumentExtractionError,
)


def run_test(description, file_path):

    print("\nTEST:", description)

    try:
        sections = extract_document(file_path)
        print("SUCCESS:", len(sections), "sections")

    except FileNotFoundError as error:
        print("EXPECTED ERROR:", error)

    except ValueError as error:
        print("EXPECTED ERROR:", error)

    except DocumentExtractionError as error:
        print("EXPECTED ERROR:", error)


# Test 1: Missing document
run_test(
    "Missing file",
    str(Path(__file__).resolve().parent.parent / "sample_documents") + "/missing.pdf"
)


# Test 2: Unsupported extension
run_test(
    "Unsupported file",
    str(Path(__file__).resolve().parent.parent / "sample_documents") + "/example.txt"
)


# Test 3: Corrupt PDF
corrupt_pdf = Path(str(Path(__file__).resolve().parent.parent / "sample_documents") + "/corrupt.pdf")
corrupt_pdf.write_text("This is not a real PDF.")

run_test(
    "Corrupt PDF",
    corrupt_pdf
)
