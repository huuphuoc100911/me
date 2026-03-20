const { del } = require('@vercel/blob');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
    }
    const { url } = JSON.parse(body);

    if (!url) {
      return res.status(400).json({ error: 'Missing url' });
    }

    await del(url);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Delete error:', err);
    return res.status(500).json({ error: 'Delete failed', detail: err.message });
  }
};
