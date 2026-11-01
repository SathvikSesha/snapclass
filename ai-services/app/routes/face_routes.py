from io import BytesIO

from fastapi import APIRouter, File, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError

from app.services.face_service import extract_face_embedding

router = APIRouter(prefix="/api/face", tags=["Face"])

MAX_IMAGE_SIZE = 5 * 1024 * 1024
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}


@router.post("/embedding")
async def create_face_embedding(
    image_file: UploadFile = File(..., alias="image")
):
    if image_file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=415,
            detail="Image must be JPEG, PNG, or WebP."
        )

    content = await image_file.read(MAX_IMAGE_SIZE + 1)

    if len(content) > MAX_IMAGE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="Image must not exceed 5 MB."
        )

    try:
        with Image.open(BytesIO(content)) as uploaded_image:
            uploaded_image.verify()

        with Image.open(BytesIO(content)) as uploaded_image:
            pil_image = uploaded_image.convert("RGB")

        embedding = extract_face_embedding(pil_image)

        return {
            "success": True,
            "dimensions": len(embedding),
            "embedding": embedding,
        }

    except (UnidentifiedImageError, OSError):
        raise HTTPException(
            status_code=400,
            detail="The uploaded file is not a valid image."
        )

    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error))

    finally:
        await image_file.close()