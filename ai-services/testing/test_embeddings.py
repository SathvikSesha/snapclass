import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pathlib import Path
from math import sqrt

from app.rag.ingestion.document_extractor import ingest_document
from app.rag.chunking.text_chunker import chunk_document
from app.rag.embeddings.embedding_service import EmbeddingService


SAMPLE_FOLDER = Path(__file__).resolve().parent.parent / "sample_documents"


def main():
    # Load the model once and reuse it.
    embedding_service = EmbeddingService()

    all_chunks = []

    # Extract and chunk all supported sample documents.
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
                f"{len(chunks)} chunks created"
            )

        except Exception as error:
            print(f"Skipping {file_path.name}: {error}")

    print("\n" + "=" * 60)
    print("DOCUMENT EMBEDDING TEST")
    print("=" * 60)

    # Generate vectors for all chunks together.
    vectors = embedding_service.embed_documents(all_chunks)

    print(f"Total chunks: {len(all_chunks)}")
    print(f"Total embeddings: {len(vectors)}")

    if vectors:
        print(f"Vector dimensions: {len(vectors[0])}")

        # Check that each vector has approximately unit length.
        first_vector_norm = sqrt(
            sum(value * value for value in vectors[0])
        )

        print(f"First vector norm: {first_vector_norm:.4f}")

        print("\nFirst chunk:")
        print(all_chunks[0].text[:300])

        print("\nFirst vector (first 10 values):")
        print(vectors[0][:10])

    print("\n" + "=" * 60)
    print("QUERY EMBEDDING TEST")
    print("=" * 60)

    query = "What are NumPy arrays used for?"

    query_vector = embedding_service.embed_query(query)

    print(f"Query: {query}")
    print(f"Query vector dimensions: {len(query_vector)}")
    print(f"Query vector (first 10 values): {query_vector[:10]}")


if __name__ == "__main__":
    main()