
import json
from io import BytesIO

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError

from app.services.face_service import (
    extract_face_embedding,
    extract_multiple_face_embeddings,
    recognize_face_embeddings,
)

router = APIRouter(prefix="/api/face", tags=["Face"])

MAX_IMAGE_SIZE = 5 * 1024 * 1024
MAX_IMAGES = 4
MAX_TOTAL_SIZE = MAX_IMAGES * MAX_IMAGE_SIZE
MAX_IMAGE_PIXELS = 25_000_000

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}


@router.post("/embedding")
async def create_face_embedding(
    image_file: UploadFile = File(..., alias="image")
):
    if image_file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=415,
            detail="Image must be JPEG, PNG, or WebP.",
        )

    try:
        content = await image_file.read(MAX_IMAGE_SIZE + 1)

        if len(content) > MAX_IMAGE_SIZE:
            raise HTTPException(
                status_code=413,
                detail="Image must not exceed 5 MB.",
            )

        with Image.open(BytesIO(content)) as image:
            image.verify()

        with Image.open(BytesIO(content)) as image:
            if image.width * image.height > MAX_IMAGE_PIXELS:
                raise HTTPException(
                    status_code=413,
                    detail="Image dimensions are too large.",
                )
            pil_image = image.convert("RGB")

        embedding = extract_face_embedding(pil_image)

        return {
            "success": True,
            "dimensions": len(embedding),
            "embedding": embedding,
        }

    except (UnidentifiedImageError, OSError):
        raise HTTPException(
            status_code=400,
            detail="The uploaded file is not a valid image.",
        )
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error))
    finally:
        await image_file.close()


@router.post("/recognize")
async def recognize_classroom_faces(
    images: list[UploadFile] = File(...),
    enrolled_students: str = Form(...),
):
    if not 1 <= len(images) <= MAX_IMAGES:
        raise HTTPException(
            status_code=400,
            detail=f"Upload between 1 and {MAX_IMAGES} images.",
        )

    try:
        students = json.loads(enrolled_students)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=400,
            detail="enrolled_students must contain valid JSON.",
        )

    if not isinstance(students, list) or not students:
        raise HTTPException(
            status_code=400,
            detail="At least one enrolled student is required.",
        )

    # Validate all supplied student embeddings before processing photos.
    if len(students) > 500:
        raise HTTPException(
            status_code=400,
            detail="Too many enrolled students.",
        )

    for student in students:
        if not isinstance(student, dict):
            raise HTTPException(
                status_code=400,
                detail="Each student must be an object.",
            )

        student_id = student.get("studentId")
        embedding = student.get("embedding")

        if (
            student_id is None
            or not isinstance(embedding, list)
            or len(embedding) != 128
        ):
            raise HTTPException(
                status_code=400,
                detail="Each student needs studentId and a 128-value embedding.",
            )

        try:
            valid_embedding = all(
                isinstance(value, (int, float))
                and not isinstance(value, bool)
                and float("-inf") < float(value) < float("inf")
                for value in embedding
            )
        except (TypeError, ValueError):
            valid_embedding = False

        if not valid_embedding:
            raise HTTPException(
                status_code=400,
                detail="Student embeddings must contain finite numbers.",
            )

    total_size = 0
    all_face_embeddings = []

    try:
        for image_file in images:
            if image_file.content_type not in ALLOWED_TYPES:
                raise HTTPException(
                    status_code=415,
                    detail="Every image must be JPEG, PNG, or WebP.",
                )

            content = await image_file.read(MAX_IMAGE_SIZE + 1)
            total_size += len(content)

            if len(content) > MAX_IMAGE_SIZE:
                raise HTTPException(
                    status_code=413,
                    detail="Each image must not exceed 5 MB.",
                )

            if total_size > MAX_TOTAL_SIZE:
                raise HTTPException(
                    status_code=413,
                    detail="Combined image size is too large.",
                )

            with Image.open(BytesIO(content)) as image:
                image.verify()

            with Image.open(BytesIO(content)) as image:
                if image.width * image.height > MAX_IMAGE_PIXELS:
                    raise HTTPException(
                        status_code=413,
                        detail="Image dimensions are too large.",
                    )

                pil_image = image.convert("RGB")

            all_face_embeddings.extend(
                extract_multiple_face_embeddings(pil_image)
            )

        matches = recognize_face_embeddings(
            all_face_embeddings,
            students,
            threshold=0.50,
            ambiguity_margin=0.05,
        )

        # A student may appear in several images; count them only once.
        recognized = {}

        for match in matches:
            if match["status"] != "MATCHED":
                continue

            student_id = match["studentId"]
            distance = match["distance"]

            if (
                student_id not in recognized
                or distance < recognized[student_id]["distance"]
            ):
                recognized[student_id] = {
                    "studentId": student_id,
                    "distance": distance,
                }

        return {
            "success": True,
            "imagesProcessed": len(images),
            "totalFacesDetected": len(matches),
            "recognizedCount": len(recognized),
            "unknownFaces": sum(
                match["status"] == "UNIDENTIFIED"
                for match in matches
            ),
            "ambiguousFaces": sum(
                match["status"] == "AMBIGUOUS"
                for match in matches
            ),
            "recognizedStudents": list(recognized.values()),
            "detections": matches,
        }

    except (UnidentifiedImageError, OSError):
        raise HTTPException(
            status_code=400,
            detail="One or more uploaded files are invalid images.",
        )
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error))
    finally:
        for image_file in images:
            await image_file.close()
