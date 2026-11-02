from math import isfinite
import dlib
import numpy as np
import face_recognition_models
from PIL import Image, ImageOps


# Load the models once when this module is imported.
detector = dlib.get_frontal_face_detector()

shape_predictor = dlib.shape_predictor(
    face_recognition_models.pose_predictor_model_location()
)

face_recognizer = dlib.face_recognition_model_v1(
    face_recognition_models.face_recognition_model_location()
)


def extract_face_embedding(image: Image.Image) -> list[float]:
    """
    Extract one 128-dimensional face embedding from an image.
    Requires exactly one detectable face.
    """
    oriented_image = ImageOps.exif_transpose(image)
    rgb_image = np.asarray(oriented_image.convert("RGB"), dtype=np.uint8)

    faces = detector(rgb_image, 1)

    if len(faces) == 0:
        raise ValueError("No face detected. Please use a clear face image.")

    if len(faces) > 1:
        raise ValueError("Multiple faces detected. Please upload an image with one face.")

    landmarks = shape_predictor(rgb_image, faces[0])

    descriptor = face_recognizer.compute_face_descriptor(
        rgb_image,
        landmarks,
        1
    )

    embedding = np.asarray(descriptor, dtype=np.float32)

    if embedding.shape != (128,) or not np.isfinite(embedding).all():
        raise ValueError("Could not generate a valid face embedding.")

    return embedding.tolist()


def extract_multiple_face_embeddings(image: Image.Image) -> list[list[float]]:
    """
    Extract one 128-dimensional embedding per detected face.
    Returns an empty list when no faces are detected.
    """
    oriented_image = ImageOps.exif_transpose(image)
    rgb_image = np.asarray(oriented_image.convert("RGB"), dtype=np.uint8)

    faces = detector(rgb_image, 1)
    embeddings = []

    for face in faces:
        landmarks = shape_predictor(rgb_image, face)

        descriptor = face_recognizer.compute_face_descriptor(
            rgb_image,
            landmarks,
            1
        )

        embedding = np.asarray(descriptor, dtype=np.float32)

        if embedding.shape != (128,) or not np.isfinite(embedding).all():
            continue

        embeddings.append(embedding.tolist())

    return embeddings


def recognize_face_embeddings(
    face_embeddings: list[list[float]],
    enrolled_students: list[dict],
    threshold: float = 0.50,
    ambiguity_margin: float = 0.05,
) -> list[dict]:
    """
    Match detected face embeddings against enrolled students.

    enrolled_students:
        [{"studentId": 123, "embedding": [128 floats]}, ...]

    An uncertain or ambiguous match is returned as unidentified.
    """
    known_embeddings = []

    for student in enrolled_students:
        student_id = student.get("studentId")
        embedding = student.get("embedding")

        if student_id is None or not isinstance(embedding, list):
            continue

        try:
            vector = np.asarray(embedding, dtype=np.float32)
        except (TypeError, ValueError):
            continue

        if vector.shape != (128,) or not np.isfinite(vector).all():
            continue

        known_embeddings.append((student_id, vector))

    results = []

    for face_embedding in face_embeddings:
        face = np.asarray(face_embedding, dtype=np.float32)

        if face.shape != (128,) or not np.isfinite(face).all():
            results.append({
                "studentId": None,
                "distance": None,
                "status": "UNIDENTIFIED",
            })
            continue

        if not known_embeddings:
            results.append({
                "studentId": None,
                "distance": None,
                "status": "UNIDENTIFIED",
            })
            continue

        # Keep the closest distance for each student.
        distances_by_student = {}

        for student_id, known in known_embeddings:
            distance = float(np.linalg.norm(known - face))

            if not isfinite(distance):
                continue

            current = distances_by_student.get(student_id)

            if current is None or distance < current:
                distances_by_student[student_id] = distance

        ranked = sorted(
            distances_by_student.items(),
            key=lambda item: item[1],
        )

        if not ranked:
            results.append({
                "studentId": None,
                "distance": None,
                "status": "UNIDENTIFIED",
            })
            continue

        best_id, best_distance = ranked[0]

        if best_distance > threshold:
            results.append({
                "studentId": None,
                "distance": round(best_distance, 4),
                "status": "UNIDENTIFIED",
            })
            continue

        # If the top two candidates are too close, do not guess.
        if (
            len(ranked) > 1
            and ranked[1][1] - best_distance < ambiguity_margin
        ):
            results.append({
                "studentId": None,
                "distance": round(best_distance, 4),
                "status": "AMBIGUOUS",
            })
            continue

        results.append({
            "studentId": best_id,
            "distance": round(best_distance, 4),
            "status": "MATCHED",
        })

    return results
