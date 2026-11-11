
from pathlib import Path

from app.config import settings
from app.rag.ingestion.document_extractor import ingest_document
from app.rag.chunking.text_chunker import chunk_document
from app.rag.embeddings.embedding_service import EmbeddingService
from app.rag.vector_store.qdrant_store import QdrantStore


class IngestionService:
    """
    Coordinates document extraction, chunking, embedding,
    and storage in Qdrant.
    """

    def __init__(
        self,
        embedding_service: EmbeddingService,
        qdrant_store: QdrantStore,
    ):
        self.embedding_service = embedding_service
        self.qdrant_store = qdrant_store

    def ingest_file(
        self,
        file_path: str,
        subject_id: str,
        document_id: str,
        chunk_size: int = settings.CHUNK_SIZE,
        overlap: int = settings.CHUNK_OVERLAP,
    ) -> dict:
        """
        Ingest a document into Qdrant.

        Pipeline:
            1. Validate input.
            2. Extract document text.
            3. Split extracted text into chunks.
            4. Generate embeddings.
            5. Store chunks in Qdrant.
            6. Remove obsolete chunks from previous ingestion.

        Existing indexed content is not deleted until the new
        chunks have been successfully stored.
        """

        # --------------------------------------------------
        # 1. Validate input
        # --------------------------------------------------

        if not subject_id or not subject_id.strip():
            raise ValueError("subject_id cannot be empty")

        if not document_id or not document_id.strip():
            raise ValueError("document_id cannot be empty")

        if not file_path:
            raise ValueError("file_path cannot be empty")

        path = Path(file_path)

        if not path.exists():
            raise FileNotFoundError(
                f"Document does not exist: {file_path}"
            )

        if not path.is_file():
            raise ValueError(
                f"Expected a file, received: {file_path}"
            )

        # --------------------------------------------------
        # 2. Extract document text
        # --------------------------------------------------

        extraction_result = ingest_document(str(path))

        if not extraction_result.sections:
            raise ValueError(
                "Document extraction produced no text sections"
            )

        # --------------------------------------------------
        # 3. Split extracted text into chunks
        # --------------------------------------------------

        chunks = chunk_document(
            result=extraction_result,
            chunk_size=chunk_size,
            overlap=overlap,
            document_id=document_id,
            subject_id=subject_id,
        )

        if not chunks:
            raise ValueError(
                "Document chunking produced no chunks"
            )

        # --------------------------------------------------
        # 4. Generate embeddings
        # --------------------------------------------------

        vectors = self.embedding_service.embed_documents(chunks)

        if len(vectors) != len(chunks):
            raise RuntimeError(
                "Embedding count does not match chunk count"
            )

        # --------------------------------------------------
        # 5. Store new chunks in Qdrant
        # --------------------------------------------------

        stored_count = self.qdrant_store.store_chunks(
            chunks=chunks,
            vectors=vectors,
        )

        if stored_count != len(chunks):
            raise RuntimeError(
                "Not all document chunks were stored successfully"
            )

        # --------------------------------------------------
        # 6. Remove obsolete chunks from previous ingestion
        # --------------------------------------------------

        stale_deleted_count = (
            self.qdrant_store.delete_stale_document_chunks(
                subject_id=subject_id,
                document_id=document_id,
                valid_chunk_count=len(chunks),
            )
        )

        # --------------------------------------------------
        # 7. Return ingestion summary
        # --------------------------------------------------

        return {
            "success": True,
            "message": "Document ingested successfully",
            "subject_id": subject_id,
            "document_id": document_id,
            "filename": extraction_result.filename,
            "file_type": extraction_result.file_type,
            "total_sections": extraction_result.total_sections,
            "total_characters": extraction_result.total_characters,
            "total_chunks": len(chunks),
            "total_embeddings": len(vectors),
            "stored_chunks": stored_count,
            "stale_chunks_deleted": stale_deleted_count,
        }
