
from pathlib import Path
from uuid import uuid5, NAMESPACE_URL

from qdrant_client import QdrantClient, models

from app.config import settings
from app.rag.chunking.text_chunker import TextChunk


class QdrantStore:
    """
    Stores, retrieves, and searches document chunk embeddings in Qdrant.
    """

    COLLECTION_NAME = settings.QDRANT_COLLECTION_NAME
    VECTOR_SIZE = settings.QDRANT_VECTOR_SIZE

    def __init__(
        self,
        storage_path: str | None = None,
        url: str | None = None,
        vector_size: int | None = None,
        collection_name: str | None = None,
    ):
        self.vector_size = vector_size or self.VECTOR_SIZE
        self.COLLECTION_NAME = collection_name or self.COLLECTION_NAME
        qdrant_url = url or settings.QDRANT_URL

        if qdrant_url:
            print(f"Connecting to remote Qdrant at: {qdrant_url}")
            self.client = QdrantClient(url=qdrant_url)
        else:
            local_path = storage_path or settings.QDRANT_STORAGE_PATH
            Path(local_path).mkdir(parents=True, exist_ok=True)
            self.client = QdrantClient(path=local_path)

        self._create_collection_if_needed()

    def _create_collection_if_needed(self):
        """Create the collection if it does not already exist."""

        if not self.client.collection_exists(self.COLLECTION_NAME):
            self.client.create_collection(
                collection_name=self.COLLECTION_NAME,
                vectors_config=models.VectorParams(
                    size=self.vector_size,
                    distance=models.Distance.COSINE,
                ),
            )

            print(f"Created Qdrant collection: {self.COLLECTION_NAME}")

        else:
            print(f"Using existing collection: {self.COLLECTION_NAME}")

    @staticmethod
    def _make_point_id(chunk: TextChunk) -> str:
        """
        Generate a repeatable ID for a chunk.

        The same subject, document, and chunk index produce
        the same ID during repeated ingestion runs.
        """

        identity = (
            f"{chunk.subject_id}:"
            f"{chunk.document_id}:"
            f"{chunk.chunk_index}"
        )

        return str(uuid5(NAMESPACE_URL, identity))

    def store_chunks(
        self,
        chunks: list[TextChunk],
        vectors: list[list[float]],
    ) -> int:
        """Store chunks and their corresponding embeddings."""

        if len(chunks) != len(vectors):
            raise ValueError(
                "The number of chunks must match the number of vectors"
            )

        if not chunks:
            return 0

        points = []

        for chunk, vector in zip(chunks, vectors):

            if len(vector) != self.vector_size:
                raise ValueError(
                    f"Expected vector size {self.vector_size}, "
                    f"received {len(vector)}"
                )

            point = models.PointStruct(
                id=self._make_point_id(chunk),
                vector=vector,
                payload={
                    "text": chunk.text,
                    "source": chunk.source,
                    "location": chunk.location,
                    "extraction_method": chunk.extraction_method,
                    "chunk_index": chunk.chunk_index,
                    "document_id": chunk.document_id,
                    "subject_id": chunk.subject_id,
                },
            )

            points.append(point)

        self.client.upsert(
            collection_name=self.COLLECTION_NAME,
            points=points,
            wait=True,
        )

        return len(points)

    def get_subject_chunks(
        self,
        subject_id: str,
        batch_size: int = 100,
        document_ids: list[str] | None = None,
    ) -> list[dict]:
        """
        Retrieve chunks belonging to a subject.

        If document_ids is provided, retrieve chunks only
        from those documents.

        Uses pagination to handle large collections.
        """

        if not subject_id:
            raise ValueError("subject_id cannot be empty")

        if batch_size < 1:
            raise ValueError("batch_size must be at least 1")

        if document_ids is not None:
            if not document_ids:
                return []

            if any(not document_id for document_id in document_ids):
                raise ValueError("document_ids cannot contain empty values")

        conditions = [
            models.FieldCondition(
                key="subject_id",
                match=models.MatchValue(value=subject_id),
            )
        ]

        if document_ids is not None:
            conditions.append(
                models.FieldCondition(
                    key="document_id",
                    match=models.MatchAny(any=document_ids),
                )
            )

        search_filter = models.Filter(must=conditions)

        all_chunks = []
        offset = None

        while True:
            points, next_offset = self.client.scroll(
                collection_name=self.COLLECTION_NAME,
                scroll_filter=search_filter,
                limit=batch_size,
                offset=offset,
                with_payload=True,
                with_vectors=False,
            )

            for point in points:
                payload = point.payload or {}

                all_chunks.append({
                    "point_id": str(point.id),
                    "text": payload.get("text", ""),
                    "document_id": payload.get("document_id"),
                    "subject_id": payload.get("subject_id"),
                    "source": payload.get("source"),
                    "location": payload.get("location"),
                    "chunk_index": payload.get("chunk_index"),
                })

            if next_offset is None:
                break

            offset = next_offset

        # Keep chunks in predictable document/chunk order.
        all_chunks.sort(
            key=lambda chunk: (
                str(chunk["document_id"]),
                (
                    chunk["chunk_index"]
                    if chunk["chunk_index"] is not None
                    else -1
                ),
            )
        )

        return all_chunks

    def search(
        self,
        query_vector: list[float],
        subject_id: str,
        limit: int = 5,
        document_id: str | None = None,
    ):
        """
        Search chunks within a subject.

        If document_id is supplied, search only that document.
        """

        if not subject_id:
            raise ValueError("subject_id cannot be empty")

        if len(query_vector) != self.vector_size:
            raise ValueError(
                f"Expected query vector size {self.vector_size}, "
                f"received {len(query_vector)}"
            )

        if limit < 1:
            raise ValueError("limit must be at least 1")

        conditions = [
            models.FieldCondition(
                key="subject_id",
                match=models.MatchValue(value=subject_id),
            )
        ]

        if document_id is not None:
            conditions.append(
                models.FieldCondition(
                    key="document_id",
                    match=models.MatchValue(value=document_id),
                )
            )

        search_filter = models.Filter(must=conditions)

        response = self.client.query_points(
            collection_name=self.COLLECTION_NAME,
            query=query_vector,
            query_filter=search_filter,
            limit=limit,
            with_payload=True,
        )

        return response.points

    def delete_stale_document_chunks(
        self,
        subject_id: str,
        document_id: str,
        valid_chunk_count: int,
    ) -> int:
        """
        Delete obsolete chunks from previous ingestions where chunk_index >= valid_chunk_count.
        """
        if not subject_id:
            raise ValueError("subject_id cannot be empty")

        if not document_id:
            raise ValueError("document_id cannot be empty")

        if valid_chunk_count < 0:
            raise ValueError("valid_chunk_count cannot be negative")

        filter_condition = models.Filter(
            must=[
                models.FieldCondition(
                    key="subject_id",
                    match=models.MatchValue(value=subject_id),
                ),
                models.FieldCondition(
                    key="document_id",
                    match=models.MatchValue(value=document_id),
                ),
                models.FieldCondition(
                    key="chunk_index",
                    range=models.Range(gte=valid_chunk_count),
                ),
            ]
        )

        points, _ = self.client.scroll(
            collection_name=self.COLLECTION_NAME,
            scroll_filter=filter_condition,
            limit=1000,
            with_payload=False,
            with_vectors=False,
        )

        if not points:
            return 0

        point_ids = [point.id for point in points]

        self.client.delete(
            collection_name=self.COLLECTION_NAME,
            points_selector=models.PointIdsList(points=point_ids),
            wait=True,
        )

        return len(point_ids)

    def delete_document(
        self,
        subject_id: str,
        document_id: str,
    ) -> int:
        """
        Delete all chunks belonging to a document within a subject.
        """
        if not subject_id:
            raise ValueError("subject_id cannot be empty")

        if not document_id:
            raise ValueError("document_id cannot be empty")

        filter_condition = models.Filter(
            must=[
                models.FieldCondition(
                    key="subject_id",
                    match=models.MatchValue(value=subject_id),
                ),
                models.FieldCondition(
                    key="document_id",
                    match=models.MatchValue(value=document_id),
                ),
            ]
        )

        all_point_ids = []
        offset = None

        while True:
            points, next_offset = self.client.scroll(
                collection_name=self.COLLECTION_NAME,
                scroll_filter=filter_condition,
                limit=1000,
                offset=offset,
                with_payload=False,
                with_vectors=False,
            )

            for point in points:
                all_point_ids.append(point.id)

            if next_offset is None:
                break
            offset = next_offset

        if not all_point_ids:
            return 0

        self.client.delete(
            collection_name=self.COLLECTION_NAME,
            points_selector=models.PointIdsList(points=all_point_ids),
            wait=True,
        )

        return len(all_point_ids)

    def delete_subject(
        self,
        subject_id: str,
    ) -> int:
        """
        Delete all chunks belonging to an entire subject.
        """
        if not subject_id:
            raise ValueError("subject_id cannot be empty")

        filter_condition = models.Filter(
            must=[
                models.FieldCondition(
                    key="subject_id",
                    match=models.MatchValue(value=subject_id),
                ),
            ]
        )

        all_point_ids = []
        offset = None

        while True:
            points, next_offset = self.client.scroll(
                collection_name=self.COLLECTION_NAME,
                scroll_filter=filter_condition,
                limit=1000,
                offset=offset,
                with_payload=False,
                with_vectors=False,
            )

            for point in points:
                all_point_ids.append(point.id)

            if next_offset is None:
                break
            offset = next_offset

        if not all_point_ids:
            return 0

        self.client.delete(
            collection_name=self.COLLECTION_NAME,
            points_selector=models.PointIdsList(points=all_point_ids),
            wait=True,
        )

        return len(all_point_ids)

    def close(self):
        """Close the Qdrant client."""

        self.client.close()
