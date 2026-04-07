import os
import tempfile
from fastapi import FastAPI, File, UploadFile, HTTPException
from deepface import DeepFace

app = FastAPI(title="Face Service", description="CNN face embedding service using DeepFace + FaceNet")

MODEL_NAME = os.getenv("FACE_MODEL", "Facenet")
DETECTOR = os.getenv("FACE_DETECTOR", "opencv")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/embed")
async def get_embedding(file: UploadFile = File(...)):
    """
    Menerima file gambar, mengembalikan embedding vector (list of float).
    Model: FaceNet (512-dim). Dipakai untuk register maupun verify.
    """
    contents = await file.read()

    suffix = os.path.splitext(file.filename or "image.jpg")[1] or ".jpg"

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(contents)
        tmp_path = tmp.name

    try:
        result = DeepFace.represent(
            img_path=tmp_path,
            model_name=MODEL_NAME,
            detector_backend=DETECTOR,
            enforce_detection=True,
        )
        embedding = result[0]["embedding"]
        return {"embedding": embedding, "model": MODEL_NAME}

    except ValueError:
        raise HTTPException(status_code=422, detail="Face not detected. Please ensure your face is clearly visible.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        os.unlink(tmp_path)