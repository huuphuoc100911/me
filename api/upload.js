const { put } = require('@vercel/blob');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const contentType = req.headers['content-type'] || '';

    // Nếu upload bằng multipart/form-data thì parse thủ công
    if (contentType.includes('multipart/form-data')) {
      const boundary = contentType.split('boundary=')[1];
      if (!boundary) return res.status(400).json({ error: 'No boundary' });

      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      const files = parseMultipart(buffer, boundary);
      const saved = [];

      for (const file of files) {
        if (!file.filename || !file.data.length) continue;

        // Chỉ cho phép ảnh
        const ext = file.filename.split('.').pop().toLowerCase();
        if (!['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) continue;

        const name = 'love/' + Date.now() + '-' + Math.random().toString(36).slice(2, 6) + '.' + ext;
        const blob = await put(name, file.data, {
          access: 'public',
          contentType: file.contentType || 'image/' + (ext === 'jpg' ? 'jpeg' : ext),
        });
        saved.push({ url: blob.url, name: name });
      }

      return res.status(200).json({ ok: true, files: saved });
    }

    return res.status(400).json({ error: 'Invalid content type' });
  } catch (err) {
    console.error('Upload error:', err);
    return res.status(500).json({ error: 'Upload failed', detail: err.message });
  }
};

function parseMultipart(buffer, boundary) {
  const files = [];
  const boundaryBuf = Buffer.from('--' + boundary);
  const parts = [];
  let start = 0;

  while (true) {
    const idx = buffer.indexOf(boundaryBuf, start);
    if (idx === -1) break;
    if (start > 0) {
      let end = idx - 2;
      if (end > start) parts.push(buffer.slice(start, end));
    }
    start = idx + boundaryBuf.length;
    if (buffer[start] === 0x2d && buffer[start + 1] === 0x2d) break;
    if (buffer[start] === 0x0d) start += 2;
  }

  for (const part of parts) {
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;
    const header = part.slice(0, headerEnd).toString();
    const data = part.slice(headerEnd + 4);

    const filenameMatch = header.match(/filename="(.+?)"/);
    const ctMatch = header.match(/Content-Type:\s*(.+)/i);

    files.push({
      filename: filenameMatch ? filenameMatch[1] : '',
      contentType: ctMatch ? ctMatch[1].trim() : '',
      data,
    });
  }
  return files;
}
