"""Tai playlist YouTube -> MP3 320k -> ZIP. Chay nen trong thread, theo doi qua Job."""
import os
import re
import shutil
import threading
import time
import uuid
import zipfile
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import yt_dlp

BASE = Path(__file__).resolve().parent
DOWNLOADS = BASE / "downloads"
COOKIES = BASE / "cookies.txt"          # tuy chon: cho playlist private / video gioi han tuoi
MAX_TRACKS = 200                        # chan mix "RD..." vo tan
PARALLEL = 3                            # so bai tai song song
JOB_TTL = 24 * 3600                     # xoa job cu sau 24h

_ffmpeg_dir: str | None = None


def ffmpeg_dir() -> str | None:
    """Uu tien ffmpeg he thong; khong co thi dung binary cua static-ffmpeg (pip, khong can sudo)."""
    global _ffmpeg_dir
    if _ffmpeg_dir:
        return _ffmpeg_dir
    exe = shutil.which("ffmpeg")
    if not exe:
        try:
            from static_ffmpeg import run
            exe, _probe = run.get_or_fetch_platform_executables_else_raise()
        except Exception as e:  # noqa: BLE001
            raise RuntimeError(f"Khong tim thay ffmpeg va khong tai duoc static-ffmpeg: {e}") from e
    _ffmpeg_dir = os.path.dirname(exe)
    return _ffmpeg_dir


def normalize_url(url: str) -> str:
    """watch?v=..&list=.. -> playlist?list=..  (de yt-dlp lay ca playlist thay vi 1 video)."""
    url = url.strip()
    p = urlparse(url)
    if p.netloc.endswith(("youtube.com", "youtu.be")):
        lst = parse_qs(p.query).get("list", [None])[0]
        if lst:
            return f"https://www.youtube.com/playlist?list={lst}"
    return url


def is_youtube(url: str) -> bool:
    host = urlparse(url.strip()).netloc.lower()
    return host.endswith(("youtube.com", "youtu.be", "music.youtube.com"))


def _safe_name(s: str, fallback: str = "playlist") -> str:
    s = re.sub(r'[\\/:*?"<>|\x00-\x1f]', "", s or "").strip(" .")
    return s[:120] or fallback


@dataclass
class Track:
    index: int
    id: str
    title: str
    url: str
    status: str = "pending"      # pending | downloading | converting | done | failed
    progress: float = 0.0        # 0..1 (phan tai)
    error: str = ""
    file: str = ""

    def to_dict(self):
        return {k: getattr(self, k) for k in ("index", "id", "title", "status", "progress", "error")}


@dataclass
class Job:
    id: str
    url: str
    status: str = "queued"       # queued | resolving | downloading | zipping | done | failed
    title: str = ""
    tracks: list[Track] = field(default_factory=list)
    error: str = ""
    zip_path: str = ""
    zip_name: str = ""
    created: float = field(default_factory=time.time)

    @property
    def dir(self) -> Path:
        return DOWNLOADS / self.id

    def to_dict(self):
        done = sum(1 for t in self.tracks if t.status == "done")
        failed = sum(1 for t in self.tracks if t.status == "failed")
        return {
            "id": self.id,
            "url": self.url,
            "status": self.status,
            "title": self.title,
            "error": self.error,
            "total": len(self.tracks),
            "done": done,
            "failed": failed,
            "zip_ready": self.status == "done" and bool(self.zip_path),
            "zip_name": self.zip_name,
            "tracks": [t.to_dict() for t in self.tracks],
        }


_jobs: dict[str, Job] = {}
_lock = threading.Lock()


def get_job(job_id: str) -> Job | None:
    return _jobs.get(job_id)


def list_jobs() -> list[Job]:
    return sorted(_jobs.values(), key=lambda j: j.created, reverse=True)


def create_job(url: str) -> Job:
    job = Job(id=uuid.uuid4().hex[:12], url=normalize_url(url))
    with _lock:
        _jobs[job.id] = job
    threading.Thread(target=_run, args=(job,), daemon=True).start()
    return job


# ---------------------------------------------------------------- pipeline

def _base_opts() -> dict:
    opts = {
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "ignoreerrors": True,
        "retries": 3,
        "fragment_retries": 3,
    }
    if COOKIES.exists():
        opts["cookiefile"] = str(COOKIES)
    return opts


def _resolve(job: Job):
    """Lay danh sach bai (khong tai) -> job.tracks."""
    opts = {**_base_opts(), "extract_flat": "in_playlist", "skip_download": True, "playlistend": MAX_TRACKS}
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(job.url, download=False)
    if not info:
        raise RuntimeError("Khong doc duoc link. Playlist private? (them cookies.txt) hoac link sai.")

    entries = info.get("entries") if info.get("_type") == "playlist" else [info]
    entries = [e for e in (entries or []) if e]
    if not entries:
        raise RuntimeError("Playlist rong hoac khong truy cap duoc.")

    job.title = info.get("title") or "playlist"
    for i, e in enumerate(entries, 1):
        vid = e.get("id") or ""
        url = e.get("url") or e.get("webpage_url") or (f"https://www.youtube.com/watch?v={vid}" if vid else "")
        job.tracks.append(Track(index=i, id=vid, title=e.get("title") or vid or f"track {i}", url=url))


def _download_one(job: Job, t: Track):
    if not t.url:
        t.status, t.error = "failed", "Khong co URL"
        return

    def hook(d):
        if d["status"] == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            if total:
                t.progress = min(d.get("downloaded_bytes", 0) / total, 1.0)
        elif d["status"] == "finished":
            t.progress, t.status = 1.0, "converting"

    opts = {
        **_base_opts(),
        "ignoreerrors": False,
        "noplaylist": True,
        "format": "bestaudio/best",
        "outtmpl": str(job.dir / f"{t.index:02d} - %(title)s.%(ext)s"),
        "ffmpeg_location": ffmpeg_dir(),
        "writethumbnail": True,
        "postprocessors": [
            {"key": "FFmpegExtractAudio", "preferredcodec": "mp3", "preferredquality": "320"},
            {"key": "FFmpegThumbnailsConvertor", "format": "jpg"},
            {"key": "FFmpegMetadata", "add_metadata": True},
            {"key": "EmbedThumbnail"},
        ],
        "progress_hooks": [hook],
    }
    t.status = "downloading"
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(t.url, download=True)
        path = (info.get("requested_downloads") or [{}])[0].get("filepath")
        if not path or not os.path.exists(path):
            raise RuntimeError("Khong tim thay file MP3 sau khi convert")
        t.file, t.status, t.progress = path, "done", 1.0
        if info.get("title"):
            t.title = info["title"]
    except Exception as e:  # noqa: BLE001
        msg = str(e)
        msg = re.sub(r"\x1b\[[0-9;]*m", "", msg)          # bo ma mau ANSI
        msg = msg.replace("ERROR: ", "").split("\n")[0]
        t.status, t.error = "failed", msg[:300]


def _zip(job: Job):
    files = [t.file for t in job.tracks if t.status == "done" and t.file]
    if not files:
        raise RuntimeError("Khong tai duoc bai nao.")
    job.zip_name = _safe_name(job.title) + ".zip"
    zip_path = job.dir / job.zip_name
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_STORED) as zf:   # mp3 nen them khong duoc gi
        for f in files:
            zf.write(f, arcname=os.path.basename(f))
    job.zip_path = str(zip_path)
    for f in files:                       # giu zip, bo mp3 roi de tiet kiem o dia
        try:
            os.remove(f)
        except OSError:
            pass


def _run(job: Job):
    try:
        job.dir.mkdir(parents=True, exist_ok=True)
        job.status = "resolving"
        _resolve(job)

        job.status = "downloading"
        with ThreadPoolExecutor(max_workers=PARALLEL) as ex:
            list(ex.map(lambda t: _download_one(job, t), job.tracks))

        job.status = "zipping"
        _zip(job)
        job.status = "done"
    except Exception as e:  # noqa: BLE001
        job.status, job.error = "failed", str(e).replace("ERROR: ", "")[:500]
    finally:
        for p in job.dir.glob("*.jpg"):   # thumbnail tam
            p.unlink(missing_ok=True)


def cleanup_old():
    """Xoa thu muc job qua han (goi luc khoi dong)."""
    DOWNLOADS.mkdir(exist_ok=True)
    now = time.time()
    for d in DOWNLOADS.iterdir():
        if d.is_dir() and now - d.stat().st_mtime > JOB_TTL:
            shutil.rmtree(d, ignore_errors=True)
