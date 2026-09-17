"""API + giao dien: dan link playlist YouTube -> tai ve ZIP MP3."""
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import downloader as dl

BASE = Path(__file__).resolve().parent
app = FastAPI(title="YT Playlist -> MP3")
app.mount("/static", StaticFiles(directory=BASE / "static"), name="static")


class NewJob(BaseModel):
    url: str


@app.on_event("startup")
def _startup():
    dl.cleanup_old()
    try:
        print(f">> ffmpeg: {dl.ffmpeg_dir()}")
    except RuntimeError as e:
        print(f"!! {e}")


@app.get("/")
def index():
    return FileResponse(BASE / "static" / "index.html")


@app.post("/api/jobs")
def create(body: NewJob):
    url = body.url.strip()
    if not url or not dl.is_youtube(url):
        raise HTTPException(400, "Link phai la YouTube (youtube.com / youtu.be / music.youtube.com)")
    job = dl.create_job(url)
    return job.to_dict()


@app.get("/api/jobs")
def jobs():
    return [j.to_dict() for j in dl.list_jobs()]


@app.get("/api/jobs/{job_id}")
def job(job_id: str):
    j = dl.get_job(job_id)
    if not j:
        raise HTTPException(404, "Khong co job nay (server da khoi dong lai?)")
    return j.to_dict()


@app.post("/api/jobs/{job_id}/retry")
def retry_all(job_id: str):
    """Thu lai tat ca bai loi. Neu job da xong, bai tai duoc se duoc noi them vao ZIP."""
    j = dl.get_job(job_id)
    if not j:
        raise HTTPException(404, "Khong co job nay")
    return {"retried": dl.retry_failed(j), **j.to_dict()}


@app.post("/api/jobs/{job_id}/tracks/{index}/retry")
def retry_one(job_id: str, index: int):
    j = dl.get_job(job_id)
    if not j:
        raise HTTPException(404, "Khong co job nay")
    n = dl.retry_failed(j, index)
    if not n:
        raise HTTPException(400, "Bai nay khong o trang thai loi")
    return j.to_dict()


@app.get("/api/jobs/{job_id}/zip")
def zip_file(job_id: str):
    j = dl.get_job(job_id)
    if not j or not j.zip_path or j.status != "done":
        raise HTTPException(404, "ZIP chua san sang")
    return FileResponse(j.zip_path, media_type="application/zip", filename=j.zip_name)
