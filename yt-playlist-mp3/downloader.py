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
ATTEMPTS = 2                            # tu thu lai khi loi (403 tam thoi cua YouTube)
RETRY_DELAY = 3
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
    status: str = "pending"      # pending | downloading | converting | done | failed | cancelled
    progress: float = 0.0        # 0..1 (phan tai)
    error: str = ""
    file: str = ""
    retry: bool = False          # dang duoc thu lai thu cong

    def to_dict(self):
        return {k: getattr(self, k) for k in ("index", "id", "title", "status", "progress", "error", "retry")}


@dataclass
class Job:
    id: str
    url: str
    status: str = "queued"       # queued | resolving | downloading | zipping | done | failed | cancelled
    title: str = ""
    tracks: list[Track] = field(default_factory=list)
    error: str = ""
    zip_path: str = ""
    zip_name: str = ""
    created: float = field(default_factory=time.time)
    lock: threading.Lock = field(default_factory=threading.Lock, repr=False)
    cancel: threading.Event = field(default_factory=threading.Event, repr=False)

    @property
    def dir(self) -> Path:
        return DOWNLOADS / self.id

    def to_dict(self):
        done = sum(1 for t in self.tracks if t.status == "done")
        failed = sum(1 for t in self.tracks if t.status in ("failed", "cancelled"))
        retrying = sum(1 for t in self.tracks if t.retry and t.status in ("pending", "downloading", "converting"))
        return {
            "id": self.id,
            "url": self.url,
            "status": self.status,
            "title": self.title,
            "error": self.error,
            "total": len(self.tracks),
            "done": done,
            "failed": failed,
            "retrying": retrying,
            "zip_ready": self.status in ("done", "cancelled") and bool(self.zip_path),
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
    if job.cancel.is_set():
        t.status = "cancelled"
        return

    def hook(d):
        if job.cancel.is_set():                  # ngat yt-dlp giua chung
            raise yt_dlp.utils.DownloadCancelled("Da huy")
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
    t.status, t.error, t.progress = "downloading", "", 0.0
    for attempt in range(ATTEMPTS):
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(t.url, download=True)
            path = (info.get("requested_downloads") or [{}])[0].get("filepath")
            if not path or not os.path.exists(path):
                raise RuntimeError("Khong tim thay file MP3 sau khi convert")
            t.file, t.status, t.progress = path, "done", 1.0
            if info.get("title"):
                t.title = info["title"]
            return
        except Exception as e:  # noqa: BLE001
            if job.cancel.is_set() or isinstance(e, yt_dlp.utils.DownloadCancelled):
                t.status, t.error, t.progress = "cancelled", "", 0.0
                return
            msg = re.sub(r"\x1b\[[0-9;]*m", "", str(e))     # bo ma mau ANSI
            msg = msg.replace("ERROR: ", "").split("\n")[0]
            t.error = msg[:300]
            if attempt < ATTEMPTS - 1:                       # 403/timeout cua YouTube hay la tam thoi
                t.status, t.progress = "downloading", 0.0
                time.sleep(RETRY_DELAY)
    t.status = "failed"


def _add_to_zip(job: Job) -> int:
    """Nhet moi mp3 da xong vao zip (tao moi neu chua co, noi them neu da co). Goi trong job.lock."""
    files = [t.file for t in job.tracks if t.status == "done" and t.file and os.path.exists(t.file)]
    if not job.zip_path:
        job.zip_name = _safe_name(job.title) + ".zip"
        job.zip_path = str(job.dir / job.zip_name)
    mode = "a" if os.path.exists(job.zip_path) else "w"
    added = 0
    with zipfile.ZipFile(job.zip_path, mode, zipfile.ZIP_STORED) as zf:   # mp3 nen them khong duoc gi
        have = set(zf.namelist())
        for f in files:
            name = os.path.basename(f)
            if name not in have:
                zf.write(f, arcname=name)
                added += 1
    for f in files:                       # giu zip, bo mp3 roi de tiet kiem o dia
        try:
            os.remove(f)
        except OSError:
            pass
    return added


def _zip(job: Job):
    with job.lock:
        if not any(t.status == "done" and t.file for t in job.tracks):
            raise RuntimeError("Khong tai duoc bai nao.")
        _add_to_zip(job)


def retry_failed(job: Job, index: int | None = None) -> int:
    """Thu lai cac bai loi (hoac 1 bai theo index). Tra ve so bai duoc thu lai."""
    tracks = [t for t in job.tracks if t.status in ("failed", "cancelled") and (index is None or t.index == index)]
    if not tracks:
        return 0
    job.cancel.clear()
    for t in tracks:
        t.status, t.error, t.progress, t.retry = "pending", "", 0.0, True
    threading.Thread(target=_retry_worker, args=(job, tracks), daemon=True).start()
    return len(tracks)


def cancel_job(job: Job) -> bool:
    """Huy: bai dang tai bi ngat, bai chua tai bi bo, bai da xong van duoc gom vao ZIP."""
    active = job.status not in ("done", "failed", "cancelled") or any(t.retry for t in job.tracks)
    if not active:
        return False
    job.cancel.set()
    return True


def _retry_worker(job: Job, tracks: list[Track]):
    with ThreadPoolExecutor(max_workers=PARALLEL) as ex:
        list(ex.map(lambda t: _download_one(job, t), tracks))
    for t in tracks:
        t.retry = False
    # Job con dang tai -> _zip cua luong chinh se gom luon. Job da xong/loi -> tu noi vao zip.
    with job.lock:
        if job.status in ("done", "failed", "cancelled") and any(t.status == "done" and t.file for t in job.tracks):
            _add_to_zip(job)
            job.status, job.error = "done", ""
    for p in job.dir.glob("*.jpg"):
        p.unlink(missing_ok=True)


def _run(job: Job):
    try:
        job.dir.mkdir(parents=True, exist_ok=True)
        job.status = "resolving"
        _resolve(job)

        job.status = "downloading"
        with ThreadPoolExecutor(max_workers=PARALLEL) as ex:
            list(ex.map(lambda t: _download_one(job, t), job.tracks))

        if job.cancel.is_set():
            with job.lock:
                if any(t.status == "done" and t.file for t in job.tracks):
                    _add_to_zip(job)          # giu lai nhung bai da tai xong
            job.status = "cancelled"
            return

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
