import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.rag.vector_store.qdrant_store import QdrantStore


def main():
    store = QdrantStore(
        storage_path=r"D:\snapclass\ai-services\qdrant_data",
    )

    try:
        chunks = store.get_subject_chunks(
            subject_id="sample-subject-001"
        )

        print(f"Total chunks retrieved: {len(chunks)}")

        # Count chunks belonging to each document.
        document_counts = {}

        for chunk in chunks:
            document_id = chunk["document_id"]

            document_counts[document_id] = (
                document_counts.get(document_id, 0) + 1
            )

        print("\nChunks per document:")

        for document_id, count in document_counts.items():
            print(f"{document_id}: {count}")

        print("\nFirst retrieved chunk:")

        if chunks:
            print(chunks[0])

    finally:
        store.close()


if __name__ == "__main__":
    main()
