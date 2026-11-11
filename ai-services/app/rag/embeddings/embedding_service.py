from sentence_transformers import SentenceTransformer

from app.config import settings
from app.rag.chunking.text_chunker import TextChunk


class EmbeddingService:
    """
    Generates vector embeddings for document chunks and user queries.
    """

    MODEL_NAME = settings.EMBEDDING_MODEL

    QUERY_INSTRUCTION = (
        "Represent this sentence for searching relevant passages: "
    )

    def __init__(self, model_name: str | None = None):
        self.model_name = model_name or self.MODEL_NAME
        print(f"Loading embedding model: {self.model_name}")

        self.model = SentenceTransformer(self.model_name)

        self.vector_size = self.model.get_embedding_dimension()

        print(f"Embedding model loaded. Vector size: {self.vector_size}")

    def embed_documents(
        self,
        chunks: list[TextChunk],
        batch_size: int = 16,
    ) -> list[list[float]]:
        """
        Generate embeddings for document chunks.
        """

        if not chunks:
            return []

        texts = [chunk.text for chunk in chunks]

        vectors = self.model.encode(
            texts,
            batch_size=batch_size,
            show_progress_bar=False,
            convert_to_numpy=True,
            normalize_embeddings=True,
        )

        return vectors.tolist()

    def embed_query(self, query: str) -> list[float]:
        """
        Generate an embedding for a student's search query.
        """

        if not query or not query.strip():
            raise ValueError("Query cannot be empty")

        query_text = self.QUERY_INSTRUCTION + query.strip()

        vector = self.model.encode(
            query_text,
            show_progress_bar=False,
            convert_to_numpy=True,
            normalize_embeddings=True,
        )

        return vector.tolist()