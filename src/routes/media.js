const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mediaModule = require('../media');
const { authMiddleware } = require('../auth');
const { verifyToken } = require('../auth');

const router = express.Router();

function optionalAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    const token = auth.substring(7);
    const decoded = verifyToken(token);
    if (decoded) {
      req.userId = decoded.id;
      req.userRole = decoded.role || 'user';
    }
  }
  next();
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = mediaModule.UPLOAD_DIR;
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp', 'image/tiff',
      'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo',
      'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/mp4', 'audio/flac',
      'application/pdf',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain', 'text/markdown', 'text/csv',
      'application/zip', 'application/x-rar-compressed',
    ];
    if (allowed.includes(file.mimetype) || file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/') || file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

// ========== PUBLIC MEDIA ENDPOINTS ==========

router.get('/', async (req, res) => {
  try {
    const { persona_id, type, folder, tag, search, page, limit, sort, order } = req.query;
    const result = await mediaModule.listMedia({
      persona_id: persona_id || null,
      type: type || null,
      folder: folder || null,
      tag: tag || null,
      search: search || null,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 30,
      sort: sort || 'created_at',
      order: order || 'DESC',
    });
    res.json(result);
  } catch (err) {
    console.error('[Media] List error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/folders', async (req, res) => {
  try {
    const { persona_id } = req.query;
    const folders = await mediaModule.getMediaFolders(persona_id || null);
    res.json({ folders });
  } catch (err) {
    console.error('[Media] Folders error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const { persona_id } = req.query;
    const stats = await mediaModule.getMediaStats(persona_id || null);
    res.json(stats);
  } catch (err) {
    console.error('[Media] Stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/gallery', async (req, res) => {
  try {
    const { persona_id, folder, type } = req.query;
    let mediaList;
    if (folder) {
      mediaList = await mediaModule.getMediaByFolder(persona_id || null, folder);
    } else {
      const result = await mediaModule.listMedia({
        persona_id: persona_id || null,
        type: type || null,
        status: 'ready',
        limit: 50,
      });
      mediaList = result.media;
    }
    const gallery = mediaList.map(m => ({
      id: m.id,
      title: m.title,
      type: m.type,
      url: m.url,
      thumbnail: m.type === 'image' ? m.url : (m.metadata?.thumbnail || null),
      mimetype: m.mimetype,
      size: m.size,
      alt_text: m.alt_text,
      caption: m.caption,
      folder: m.folder,
      tags: m.tags,
      metadata: m.metadata || {},
      created_at: m.created_at,
    }));
    res.json({ gallery, total: gallery.length });
  } catch (err) {
    console.error('[Media] Gallery error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const media = await mediaModule.getMedia(req.params.id);
    if (!media) return res.status(404).json({ error: 'Media not found' });
    await mediaModule.incrementViews(req.params.id);
    res.json(media);
  } catch (err) {
    console.error('[Media] Get error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/stream', async (req, res) => {
  try {
    const media = await mediaModule.getMedia(req.params.id);
    if (!media) return res.status(404).json({ error: 'Media not found' });

    if (!media.filename) {
      if (media.url) return res.redirect(media.url);
      return res.status(404).json({ error: 'File not found' });
    }

    const filePath = path.join(mediaModule.UPLOAD_DIR, media.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' });

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range && (media.type === 'video' || media.type === 'audio')) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = (end - start) + 1;
      const file = fs.createReadStream(filePath, { start, end });
      const headers = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': media.mimetype,
      };
      res.writeHead(206, headers);
      file.pipe(res);
    } else {
      res.setHeader('Content-Type', media.mimetype);
      res.setHeader('Content-Length', fileSize);
      if (media.type === 'image' || media.type === 'video' || media.type === 'audio') {
        res.setHeader('Content-Disposition', `inline; filename="${media.original_name || media.filename}"`);
      } else {
        res.setHeader('Content-Disposition', `attachment; filename="${media.original_name || media.filename}"`);
      }
      fs.createReadStream(filePath).pipe(res);
    }

    await mediaModule.incrementViews(req.params.id);
  } catch (err) {
    console.error('[Media] Stream error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ========== UPLOAD (auth required) ==========

router.post('/upload', optionalAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const { persona_id, title, description, alt_text, caption, tags, folder } = req.body;
    const parsedTags = typeof tags === 'string' ? JSON.parse(tags) : (tags || []);

    const media = await mediaModule.createMediaFromUpload(req.file, {
      persona_id: persona_id || null,
      owner_id: req.userId || null,
      title,
      description,
      alt_text,
      caption,
      tags: parsedTags,
      folder,
    });

    res.json(media);
  } catch (err) {
    console.error('[Media] Upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/upload-batch', authMiddleware, upload.array('files', 20), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });

    const { persona_id, folder } = req.body;
    const results = [];

    for (const file of req.files) {
      const media = await mediaModule.createMediaFromUpload(file, {
        persona_id: persona_id || null,
        owner_id: req.userId || null,
        folder,
      });
      results.push(media);
    }

    res.json({ media: results, total: results.length });
  } catch (err) {
    console.error('[Media] Batch upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ========== UPDATE / DELETE (auth required) ==========

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const media = await mediaModule.updateMedia(req.params.id, req.body);
    if (!media) return res.status(404).json({ error: 'Media not found' });
    res.json(media);
  } catch (err) {
    console.error('[Media] Update error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const result = await mediaModule.deleteMedia(req.params.id);
    res.json(result);
  } catch (err) {
    console.error('[Media] Delete error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;