"""Local bureau grid service. Nest is not wired in yet.

Run from this folder:
  .venv\\Scripts\\python.exe -m uvicorn app:app --host 127.0.0.1 --port 8077
"""

from fastapi import FastAPI, File, HTTPException, UploadFile

from grid import extract_bytes, grid_payload

app = FastAPI(title="bureau-grid", version="0.1.0")


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.post("/extract/bureau")
async def extract_bureau(file: UploadFile = File(...)) -> dict:
    data = await file.read()
    if not data.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="Se esperaba un PDF")
    credits = extract_bytes(data)
    return grid_payload(credits)
