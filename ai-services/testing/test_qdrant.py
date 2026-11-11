import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pathlib import Path

from app.rag.ingestion.document_extractor import ingest_document
from app.rag.chunking.text_chunker import chunk_document
from app.rag.embeddings.embedding_service import EmbeddingService
from app.rag.vector_store.qdrant_store import QdrantStore


SAMPLE_FOLDER = Path(__file__).resolve().parent.parent / "sample_documents"


def main():
    embedding_service = EmbeddingService()

    qdrant = QdrantStore(
        storage_path="qdrant_data",
        vector_size=embedding_service.vector_size,
    )

    try:
        all_chunks = []

        # Extract and chunk every supported sample document.
        for file_path in SAMPLE_FOLDER.iterdir():

            if file_path.suffix.lower() not in {".pdf", ".docx", ".pptx"}:
                continue

            try:
                extracted = ingest_document(file_path)

                chunks = chunk_document(
                    result=extracted,
                    chunk_size=1500,
                    overlap=200,
                    document_id=file_path.stem,
                    subject_id="sample-subject-001",
                )

                all_chunks.extend(chunks)

                print(
                    f"{file_path.name}: "
                    f"{len(chunks)} chunks"
                )

            except Exception as error:
                print(f"Skipping {file_path.name}: {error}")

        # Generate embeddings.
        vectors = embedding_service.embed_documents(all_chunks)

        # Store chunks and embeddings.
        stored_count = qdrant.store_chunks(all_chunks, vectors)

        print("\n" + "=" * 60)
        print("QDRANT STORAGE RESULTS")
        print("=" * 60)
        print(f"Chunks processed: {len(all_chunks)}")
        print(f"Points stored or updated: {stored_count}")

        # Search using a student's question.
        question = "What are NumPy arrays used for?"

        query_vector = embedding_service.embed_query(question)

        results = qdrant.search(
            query_vector=query_vector,
            subject_id="sample-subject-001",
            limit=5,
        )

        print("\n" + "=" * 60)
        print("SEMANTIC SEARCH RESULTS")
        print("=" * 60)
        print(f"Question: {question}")

        for rank, result in enumerate(results, start=1):
            payload = result.payload or {}

            print(f"\nResult {rank}")
            print(f"Similarity score: {result.score:.4f}")
            print(f"Document: {payload.get('document_id')}")
            print(f"Location: {payload.get('location')}")
            print(f"Text: {payload.get('text', '')[:500]}")

        # Test document-level filtering.
        print("\n" + "=" * 60)
        print("DOCUMENT FILTER TEST")
        print("=" * 60)

        document_results = qdrant.search(
            query_vector=query_vector,
            subject_id="sample-subject-001",
            document_id="pptdocument",
            limit=5,
        )

        print(
            "Results restricted to pptdocument:",
            len(document_results),
        )

        for result in document_results:
            print(
                "Document:",
                result.payload.get("document_id"),
                "| Location:",
                result.payload.get("location"),
            )

    finally:
        qdrant.close()


if __name__ == "__main__":
    main()