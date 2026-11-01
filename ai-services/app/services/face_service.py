import dlib
import numpy as np
import face_recognition_models
from PIL import Image


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
    rgb_image = np.asarray(image.convert("RGB"), dtype=np.uint8)

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