# Playlist → MP3

Dán link playlist YouTube → bấm tải → nhận 1 file ZIP chứa toàn bộ bài dạng MP3 320 kbps (có ảnh bìa + tên bài/nghệ sĩ).

Chạy **trên máy** (không deploy Vercel được: cần ffmpeg, chạy lâu, file lớn).

## Chạy

```bash
./run.sh
```

Lần đầu tự cài `uv` (không cần sudo), tạo venv, cài deps, tải ffmpeg (~45 giây). Sau đó mở **http://127.0.0.1:8000**.

Dừng: `Ctrl+C`. Đổi cổng: `PORT=9000 ./run.sh`.

## Dùng

1. Dán link — nhận cả dạng `playlist?list=...` lẫn `watch?v=...&list=...` (tự chuyển sang cả playlist). Link 1 video lẻ cũng tải được.
2. Theo dõi tiến độ từng bài. Bài lỗi (video bị xoá / private / 403 tạm thời) sẽ báo đỏ nhưng **không chặn** các bài còn lại. Mỗi bài tự thử lại 1 lần trước khi báo lỗi.
3. Bài nào vẫn đỏ: bấm **↻ thử lại** ở bài đó, hoặc **↻ Thử lại N bài lỗi** cho cả loạt. Kể cả khi playlist đã xong và đã có ZIP, bài tải lại được **nối thêm vào ZIP cũ** — không phải tải lại từ đầu.
4. **✕ Hủy tải** bất cứ lúc nào: bài đang tải bị ngắt, bài chưa tải bị bỏ, **bài đã xong vẫn được gom thành ZIP**. Đổi ý thì bấm thử lại — bài tải thêm được nối vào ZIP đó.
5. Bấm **⬇ Tải <tên playlist>.zip**.

## Playlist private / video giới hạn tuổi

Playlist "Không công khai" tải bình thường. Playlist **Riêng tư** cần đăng nhập:
xuất cookies từ trình duyệt (extension *Get cookies.txt LOCALLY*) → lưu thành `cookies.txt` ngay trong thư mục này. App tự nhận.

## Giới hạn

- Tối đa 200 bài / playlist (chặn mix "RD..." vô tận). Sửa `MAX_TRACKS` trong `downloader.py`.
- Tải 3 bài song song (`PARALLEL`).
- Thư mục `downloads/` tự dọn job cũ hơn 24 giờ khi khởi động lại.
- Chất lượng: YouTube chỉ có audio ~128–160 kbps, MP3 320 là trần — không "đẹp hơn nguồn" được.
- YouTube đổi API thường xuyên → nếu bỗng lỗi hàng loạt, cập nhật: `~/.local/bin/uv pip install -U yt-dlp --python .venv/bin/python`

## Cấu trúc

```
app.py          FastAPI: POST /api/jobs, GET /api/jobs/{id}, GET /api/jobs/{id}/zip
downloader.py   yt-dlp: đọc playlist → tải bestaudio → MP3 320k → zip
static/         giao diện 1 trang
downloads/      (gitignore) file tạm + zip theo job
```
