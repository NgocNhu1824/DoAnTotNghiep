import base64
import os
from typing import List, Optional

import cv2
import insightface
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

APP_TITLE = 'InsightFace Embedding Provider'
APP_VERSION = '1.0.0'

INSIGHTFACE_MODEL_NAME = os.getenv('INSIGHTFACE_MODEL_NAME', 'buffalo_l')
INSIGHTFACE_DET_SIZE = int(os.getenv('INSIGHTFACE_DET_SIZE', '640'))
INSIGHTFACE_EXECUTION_PROVIDERS = [
    provider.strip()
    for provider in os.getenv('INSIGHTFACE_EXECUTION_PROVIDERS', 'CPUExecutionProvider').split(',')
    if provider.strip()
]


class EmbeddingRequest(BaseModel):
    imageBase64: str = Field(min_length=100, max_length=4_000_000)


class EmbeddingResponseData(BaseModel):
    embedding: List[float]
    dimension: int
    model: str
    detectorScore: Optional[float] = None
    poseYaw: Optional[float] = None
    posePitch: Optional[float] = None
    poseRoll: Optional[float] = None
    bboxCenterX: Optional[float] = None
    bboxArea: Optional[float] = None


class EmbeddingResponse(BaseModel):
    success: bool
    data: EmbeddingResponseData


app = FastAPI(title=APP_TITLE, version=APP_VERSION)


def _select_ctx_id() -> int:
    for provider in INSIGHTFACE_EXECUTION_PROVIDERS:
        if provider == 'CUDAExecutionProvider':
            return 0
    return -1


face_analyzer = insightface.app.FaceAnalysis(
    name=INSIGHTFACE_MODEL_NAME,
    providers=INSIGHTFACE_EXECUTION_PROVIDERS,
)
face_analyzer.prepare(
    ctx_id=_select_ctx_id(),
    det_size=(INSIGHTFACE_DET_SIZE, INSIGHTFACE_DET_SIZE),
)


def _decode_image(image_base64: str) -> np.ndarray:
    normalized = image_base64.strip()
    if normalized.startswith('data:image'):
        parts = normalized.split(',', 1)
        if len(parts) != 2:
            raise HTTPException(status_code=400, detail='Invalid data-url image payload')
        normalized = parts[1]

    try:
        image_bytes = base64.b64decode(normalized, validate=True)
    except Exception as error:
        raise HTTPException(status_code=400, detail='Invalid base64 image payload') from error

    np_buffer = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(np_buffer, cv2.IMREAD_COLOR)

    if image is None:
        raise HTTPException(status_code=400, detail='Unable to decode image bytes')

    return image


def _face_area(face: insightface.app.common.Face) -> float:
    bbox = getattr(face, 'bbox', None)
    if bbox is None or len(bbox) != 4:
        return 0

    width = max(float(bbox[2] - bbox[0]), 0.0)
    height = max(float(bbox[3] - bbox[1]), 0.0)
    return width * height


def _extract_embedding(face: insightface.app.common.Face) -> np.ndarray:
    embedding = getattr(face, 'normed_embedding', None)
    if embedding is None:
        embedding = getattr(face, 'embedding', None)
    if embedding is None:
        raise HTTPException(status_code=500, detail='Embedding not found in provider output')

    vector = np.asarray(embedding, dtype=np.float32)
    if vector.ndim != 1 or vector.size == 0:
        raise HTTPException(status_code=500, detail='Invalid embedding vector from provider model')

    norm = float(np.linalg.norm(vector))
    if not np.isfinite(norm) or norm <= 0:
        raise HTTPException(status_code=500, detail='Invalid embedding norm from provider model')

    return vector / norm


def _extract_pose(face: insightface.app.common.Face) -> tuple[Optional[float], Optional[float], Optional[float]]:
    pose = getattr(face, 'pose', None)
    if pose is None:
        return None, None, None

    pose_array = np.asarray(pose, dtype=np.float32).reshape(-1)
    if pose_array.size < 3:
        return None, None, None

    # InsightFace returns pose as [pitch, yaw, roll].
    pitch = float(pose_array[0]) if np.isfinite(pose_array[0]) else None
    yaw = float(pose_array[1]) if np.isfinite(pose_array[1]) else None
    roll = float(pose_array[2]) if np.isfinite(pose_array[2]) else None
    return yaw, pitch, roll


def _extract_bbox(face: insightface.app.common.Face) -> tuple[Optional[float], Optional[float]]:
    bbox = getattr(face, 'bbox', None)
    if bbox is None:
        return None, None

    bbox_array = np.asarray(bbox, dtype=np.float32).reshape(-1)
    if bbox_array.size < 4:
        return None, None

    x1 = float(bbox_array[0])
    y1 = float(bbox_array[1])
    x2 = float(bbox_array[2])
    y2 = float(bbox_array[3])

    if not all(np.isfinite(value) for value in [x1, y1, x2, y2]):
        return None, None

    center_x = (x1 + x2) / 2.0
    area = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    return center_x, area


@app.get('/health')
def health() -> dict:
    return {
        'status': 'ok',
        'model': INSIGHTFACE_MODEL_NAME,
        'providers': INSIGHTFACE_EXECUTION_PROVIDERS,
    }


@app.post('/v1/face/embedding', response_model=EmbeddingResponse)
def create_embedding(payload: EmbeddingRequest) -> EmbeddingResponse:
    image = _decode_image(payload.imageBase64)

    faces = face_analyzer.get(image)
    if not faces:
        raise HTTPException(status_code=422, detail='No face detected')

    target_face = max(faces, key=_face_area)
    normalized_embedding = _extract_embedding(target_face)
    detector_score = float(getattr(target_face, 'det_score', 0.0))
    pose_yaw, pose_pitch, pose_roll = _extract_pose(target_face)
    bbox_center_x, bbox_area = _extract_bbox(target_face)

    return EmbeddingResponse(
        success=True,
        data=EmbeddingResponseData(
            embedding=normalized_embedding.astype(float).tolist(),
            dimension=int(normalized_embedding.shape[0]),
            model=INSIGHTFACE_MODEL_NAME,
            detectorScore=detector_score,
            poseYaw=pose_yaw,
            posePitch=pose_pitch,
            poseRoll=pose_roll,
            bboxCenterX=bbox_center_x,
            bboxArea=bbox_area,
        ),
    )