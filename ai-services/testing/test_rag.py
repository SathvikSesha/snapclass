import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.rag.embeddings.embedding_service import EmbeddingService
from app.rag.vector_store.qdrant_store import QdrantStore
from app.rag.generation.ollama_client import OllamaClient
from app.rag.retrieval.rag_service import RAGService


def main():

    # Load the embedding model.
    embedding_service = EmbeddingService()

    # Open the existing Qdrant database on Disk D.
    qdrant_store = QdrantStore(
        storage_path=r"D:\snapclass\ai-services\qdrant_data",
        vector_size=embedding_service.vector_size,
    )

    # Connect to the local Ollama model.
    ollama_client = OllamaClient(
        model="qwen2.5:3b",
    )

    # Create the RAG service.
    rag_service = RAGService(
        embedding_service=embedding_service,
        qdrant_store=qdrant_store,
        ollama_client=ollama_client,
    )

    try:
        question = "What are NumPy arrays used for?"

        result = rag_service.ask(
            question=question,
            subject_id="sample-subject-001",
            top_k=5,
        )

        print("\n" + "=" * 65)
        print("SNAPCLASS RAG ANSWER")
        print("=" * 65)

        print(f"\nQuestion: {question}")

        print("\nAnswer:")
        print(result["answer"])

        print("\n" + "=" * 65)
        print("RETRIEVED SOURCES")
        print("=" * 65)

        for source in result["sources"]:
            print(f"\n{source['source']}")
            print(f"Document: {source['document_id']}")
            print(f"Location: {source['location']}")
            print(f"Similarity: {source['score']:.4f}")
            print(f"Text: {source['text'][:300]}")

    finally:
        qdrant_store.close()


if __name__ == "__main__":
    main()
