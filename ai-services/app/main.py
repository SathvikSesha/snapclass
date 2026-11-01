from fastapi import FastAPI
from app.routes.face_routes import router as face_router

app = FastAPI(
    title="SnapClass AI Service",
    version="1.0.0",
)

app.include_router(face_router)


@app.get("/health")
def health_check():
    return {
        "success": True,
        "service": "snapclass-ai",
    }