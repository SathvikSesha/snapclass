from contextlib import asynccontextmanager
import logging

from fastapi import Depends, FastAPI

from app.config import settings
from app.core.logging_config import setup_logging
from app.core.security import verify_api_key
from app.core.errors import register_exception_handlers

from app.routes.health_routes import router as health_router
from app.routes.face_routes import router as face_router
from app.routes.rag_routes import router as rag_router
from app.routes.quiz_routes import router as quiz_router
from app.routes.document_routes import router as document_router
from app.routes.ingestion_routes import router as ingestion_router

from app.rag.embeddings.embedding_service import EmbeddingService
from app.rag.vector_store.qdrant_store import QdrantStore
from app.rag.generation.ollama_client import OllamaClient
from app.rag.retrieval.rag_service import RAGService
from app.rag.quiz.quiz_generator import QuizGenerator
from app.rag.ingestion.ingestion_service import IngestionService

# Initialize standardized logging
setup_logging()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting %s v%s...", settings.APP_NAME, settings.APP_VERSION)

    # -----------------------------------------------
    # Initialize shared AI components
    # -----------------------------------------------
    embedding_service = EmbeddingService()
    qdrant_store = QdrantStore()
    ollama_client = OllamaClient()

    # -----------------------------------------------
    # Initialize RAG, Quiz, and Ingestion services
    # -----------------------------------------------
    rag_service = RAGService(
        embedding_service=embedding_service,
        qdrant_store=qdrant_store,
        ollama_client=ollama_client,
    )

    quiz_generator = QuizGenerator(
        qdrant_store=qdrant_store,
        ollama_client=ollama_client,
    )

    ingestion_service = IngestionService(
        embedding_service=embedding_service,
        qdrant_store=qdrant_store,
    )

    # Store shared instances in application state
    app.state.embedding_service = embedding_service
    app.state.qdrant_store = qdrant_store
    app.state.ollama_client = ollama_client
    app.state.rag_service = rag_service
    app.state.quiz_generator = quiz_generator
    app.state.ingestion_service = ingestion_service

    logger.info("%s started successfully", settings.APP_NAME)

    try:
        yield
    finally:
        logger.info("Shutting down %s...", settings.APP_NAME)
        qdrant_store.close()
        logger.info("Qdrant connection closed")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    debug=settings.DEBUG,
    lifespan=lifespan,
)

# Register standardized global error handlers
register_exception_handlers(app)

# -----------------------------------------------
# Register public monitoring routes (unauthenticated)
# -----------------------------------------------
app.include_router(health_router)

# -----------------------------------------------
# Register API routes (guarded by API Key if enabled)
# -----------------------------------------------
api_dependencies = [Depends(verify_api_key)]

app.include_router(face_router, dependencies=api_dependencies)
app.include_router(rag_router, dependencies=api_dependencies)
app.include_router(quiz_router, dependencies=api_dependencies)
app.include_router(document_router, dependencies=api_dependencies)
app.include_router(ingestion_router, dependencies=api_dependencies)
