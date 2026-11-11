import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pathlib import Path

from app.rag.embeddings.embedding_service import EmbeddingService
from app.rag.vector_store.qdrant_store import QdrantStore
from app.rag.ingestion.ingestion_service import IngestionService


def main():

    # Initialize dependencies
    embedding_service = EmbeddingService()

    qdrant_store = QdrantStore(
        storage_path="qdrant_data"
    )

    ingestion_service = IngestionService(
        embedding_service=embedding_service,
        qdrant_store=qdrant_store,
    )

    base_dir = Path(__file__).resolve().parent
    sample_pdf = base_dir / "sample_documents" / "pdfdocument.pdf"

    try:
        result = ingestion_service.ingest_file(
            file_path=str(sample_pdf),
            subject_id="SUB001",
            document_id="DOC001",
        )

        print("\nINGESTION RESULT")
        print("-------------------------")

        for key, value in result.items():
            print(f"{key}: {value}")

        # Verify stored chunks
        chunks = qdrant_store.get_subject_chunks(
            subject_id="SUB001",
            document_ids=["DOC001"],
        )

        print("\nSTORED CHUNKS")
        print("-------------------------")
        print(f"Total chunks: {len(chunks)}")

        for chunk in chunks[:3]:
            print("\nChunk index:", chunk["chunk_index"])
            print("Document:", chunk["document_id"])
            print("Location:", chunk["location"])
            print("Text:", chunk["text"][:200])

    finally:
        qdrant_store.close()


if __name__ == "__main__":
    main()
