# InsightFace Embedding Provider

This service exposes ArcFace embeddings for the backend Face ID pipeline.

## API

- `GET /health`
- `POST /v1/face/embedding`
  - body:
    - `imageBase64` (string, required)
  - response:
    - `data.embedding` (normalized float vector)

## Run with Python

```bash
cd embedding-provider
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8008
```

## Run with Docker

```bash
cd embedding-provider
docker build -t insightface-embedding-provider .
docker run --rm -p 8008:8008 insightface-embedding-provider
```

## Backend Configuration

Set these values in backend `.env`:

```env
FACE_EMBEDDING_PROVIDER_URL=http://127.0.0.1:8008/v1/face/embedding
FACE_EMBEDDING_PROVIDER_TIMEOUT_MS=10000
FACE_EMBEDDING_ALLOW_DEV_FALLBACK=false
```

Then restart backend:

```bash
npm run start:dev
```

## Quick Test

Health:

```bash
curl http://127.0.0.1:8008/health
```

Embedding endpoint expects base64 image data:

```bash
curl -X POST http://127.0.0.1:8008/v1/face/embedding \
  -H "Content-Type: application/json" \
  -d '{"imageBase64":"<BASE64_IMAGE>"}'
```