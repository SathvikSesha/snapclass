
from app.rag.embeddings.embedding_service import EmbeddingService
from app.rag.vector_store.qdrant_store import QdrantStore
from app.rag.generation.ollama_client import OllamaClient


class RAGService:
    """
    Retrieves relevant document chunks and generates
    an answer using the local LLM.
    """

    SYSTEM_PROMPT = """
You are SnapClass, an educational assistant.

Answer the student's question using ONLY the document
context provided in the user's message.

Rules:
1. Do not invent facts that are not supported by the context.
2. If the context does not contain enough information,
   clearly say that the available documents do not provide
   enough information to answer.
3. Explain concepts clearly and simply.
4. When using information from a passage, cite its source
   using its exact reference, such as [Source 1].
5. Do not invent source references.
6. You may combine information from multiple passages,
   but cite each relevant source.
"""

    def __init__(
        self,
        embedding_service: EmbeddingService,
        qdrant_store: QdrantStore,
        ollama_client: OllamaClient,
    ):
        self.embedding_service = embedding_service
        self.qdrant_store = qdrant_store
        self.ollama_client = ollama_client

    def ask(
        self,
        question: str,
        subject_id: str,
        document_id: str | None = None,
        top_k: int = 5,
    ) -> dict:

        if not question or not question.strip():
            raise ValueError("Question cannot be empty")

        if top_k < 1:
            raise ValueError("top_k must be at least 1")

        # Step 1: Convert the question into an embedding.
        query_vector = self.embedding_service.embed_query(question)

        # Step 2: Retrieve relevant chunks from Qdrant.
        retrieved_points = self.qdrant_store.search(
            query_vector=query_vector,
            subject_id=subject_id,
            document_id=document_id,
            limit=top_k,
        )

        # Step 3: Handle cases where no context was retrieved.
        if not retrieved_points:
            return {
                "answer": (
                    "I couldn't find relevant information in "
                    "the available documents to answer that question."
                ),
                "sources": [],
            }

        # Step 4: Build context and source references.
        context_parts = []
        sources = []

        for index, point in enumerate(retrieved_points, start=1):
            payload = point.payload or {}

            source_id = f"Source {index}"

            text = payload.get("text", "")
            document = payload.get("document_id", "Unknown")
            location = payload.get("location", "Unknown")

            context_parts.append(
                f"[{source_id}]\n"
                f"Document: {document}\n"
                f"Location: {location}\n"
                f"Content:\n{text}"
            )

            sources.append({
                "source": source_id,
                "document_id": document,
                "location": location,
                "score": point.score,
                "text": text,
            })

        context = "\n\n".join(context_parts)

        # Step 5: Construct the prompt.
        user_prompt = f"""
DOCUMENT CONTEXT:

{context}

STUDENT QUESTION:

{question}

Answer the question using the document context.
Include source references in your answer.
"""

        # Step 6: Generate the grounded answer.
        answer = self.ollama_client.generate(
            system_prompt=self.SYSTEM_PROMPT,
            user_prompt=user_prompt,
        )

        return {
            "answer": answer,
            "sources": sources,
        }
