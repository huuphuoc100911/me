const { list } = require('@vercel/blob');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { blobs } = await list({ prefix: 'love/' });

    // Sắp xếp mới nhất trước
    const images = blobs
      .filter(b => /\.(jpe?g|png|gif|webp)$/i.test(b.pathname))
      .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
      .map(b => ({
        url: b.url,
        name: b.pathname,
        uploadedAt: b.uploadedAt,
      }));

    return res.status(200).json(images);
  } catch (err) {
    console.error('List error:', err);
    return res.status(500).json({ error: 'List failed', detail: err.message });
  }
};
