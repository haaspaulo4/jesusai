const { pool } = require('../db');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

const MEDIA_TYPES = ['image', 'video', 'audio', 'document', 'presentation', 'spreadsheet', 'archive', 'other'];
const MEDIA_STATUS = ['uploading', 'ready', 'processing', 'failed', 'archived'];

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'public', 'uploads', 'media');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function getMediaType(mimetype, ext) {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('audio/')) return 'audio';
  if (mimetype === 'application/pdf') return 'document';
  if (['.doc', '.docx', '.odt', '.rtf', '.txt'].includes(ext)) return 'document';
  if (['.ppt', '.pptx', '.odp', '.key'].includes(ext)) return 'presentation';
  if (['.xls', '.xlsx', '.csv', '.ods'].includes(ext)) return 'spreadsheet';
  if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext)) return 'archive';
  return 'other';
}

function getExtension(filename) {
  return path.extname(filename).toLowerCase();
}

async function createMedia({ persona_id, owner_id, title, description, filename, original_name, mimetype, size, url, type, alt_text, caption, metadata, tags, folder, source }) {
  const id = 'media_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
  const ext = getExtension(original_name || filename || '');
  const mediaType = type || getMediaType(mimetype || 'application/octet-stream', ext);

  await pool.execute(
    `INSERT INTO media_library (id, persona_id, owner_id, title, description, filename, original_name, mimetype, size, url, type, alt_text, caption, metadata, tags, folder, source, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready')`,
    [
      id,
      persona_id || null,
      owner_id || null,
      title || path.basename(original_name || filename || '', ext),
      description || null,
      filename || null,
      original_name || null,
      mimetype || 'application/octet-stream',
      size || 0,
      url || null,
      mediaType,
      alt_text || null,
      caption || null,
      JSON.stringify(metadata || {}),
      JSON.stringify(tags || []),
      folder || null,
      source || 'upload',
    ]
  );

  return getMedia(id);
}

async function getMedia(mediaId) {
  const [rows] = await pool.execute('SELECT * FROM media_library WHERE id = ?', [mediaId]);
  if (rows.length === 0) return null;
  return deserializeMedia(rows[0]);
}

async function listMedia({ persona_id, owner_id, type, folder, tag, search, status, page, limit, sort, order } = {}) {
  page = page || 1;
  limit = limit || 30;
  const offset = (page - 1) * limit;

  let query = 'SELECT * FROM media_library WHERE 1=1';
  const params = [];

  if (persona_id) { query += ' AND persona_id = ?'; params.push(persona_id); }
  if (owner_id) { query += ' AND owner_id = ?'; params.push(owner_id); }
  if (type) { query += ' AND type = ?'; params.push(type); }
  if (folder) { query += ' AND folder = ?'; params.push(folder); }
  if (tag) { query += ' AND JSON_CONTAINS(tags, ?)'; params.push(JSON.stringify(tag)); }
  if (status) { query += ' AND status = ?'; params.push(status); }
  else { query += " AND status != 'archived'"; }
  if (search) { query += ' AND (title LIKE ? OR description LIKE ? OR original_name LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }

  const sortCol = sort === 'size' ? 'size' : sort === 'type' ? 'type' : 'created_at';
  const sortOrder = (order || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  query += ` ORDER BY ${sortCol} ${sortOrder} LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;

  const [rows] = await pool.execute(query, params);
  const [totalResult] = await pool.execute('SELECT COUNT(*) as total FROM media_library WHERE 1=1');

  return {
    media: rows.map(deserializeMedia),
    total: totalResult[0].total,
    page,
    limit,
  };
}

async function updateMedia(mediaId, updates) {
  const fields = [];
  const values = [];

  if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title); }
  if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
  if (updates.alt_text !== undefined) { fields.push('alt_text = ?'); values.push(updates.alt_text); }
  if (updates.caption !== undefined) { fields.push('caption = ?'); values.push(updates.caption); }
  if (updates.metadata !== undefined) { fields.push('metadata = ?'); values.push(JSON.stringify(updates.metadata)); }
  if (updates.tags !== undefined) { fields.push('tags = ?'); values.push(JSON.stringify(updates.tags)); }
  if (updates.folder !== undefined) { fields.push('folder = ?'); values.push(updates.folder); }
  if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
  if (updates.persona_id !== undefined) { fields.push('persona_id = ?'); values.push(updates.persona_id); }

  if (fields.length === 0) return getMedia(mediaId);

  values.push(mediaId);
  await pool.execute(`UPDATE media_library SET ${fields.join(', ')} WHERE id = ?`, values);
  return getMedia(mediaId);
}

async function deleteMedia(mediaId) {
  const media = await getMedia(mediaId);
  if (media && media.filename) {
    const filePath = path.join(UPLOAD_DIR, media.filename);
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      const thumbPath = path.join(UPLOAD_DIR, 'thumb_' + media.filename);
      if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
    } catch {}
  }
  await pool.execute('DELETE FROM media_library WHERE id = ?', [mediaId]);
  return { ok: true };
}

async function incrementViews(mediaId) {
  await pool.execute('UPDATE media_library SET views = views + 1 WHERE id = ?', [mediaId]);
}

async function getMediaByFolder(personaId, parentFolder) {
  let query = "SELECT * FROM media_library WHERE status = 'ready'";
  const params = [];

  if (personaId) {
    query += ' AND (persona_id = ? OR persona_id IS NULL)';
    params.push(personaId);
  }

  if (parentFolder) {
    query += ' AND folder = ?';
    params.push(parentFolder);
  } else {
    query += ' AND folder IS NULL';
  }

  query += ' ORDER BY type ASC, created_at DESC';
  const [rows] = await pool.execute(query, params);
  return rows.map(deserializeMedia);
}

async function getMediaFolders(personaId) {
  const [rows] = await pool.execute(
    'SELECT DISTINCT folder FROM media_library WHERE folder IS NOT NULL AND folder != ""' + (personaId ? ' AND (persona_id = ? OR persona_id IS NULL)' : '') + ' ORDER BY folder ASC',
    personaId ? [personaId] : []
  );
  return rows.map(r => r.folder);
}

async function getMediaStats(personaId) {
  let query = 'SELECT type, COUNT(*) as count, SUM(size) as total_size FROM media_library WHERE status = ?';
  const params = ['ready'];
  if (personaId) {
    query += ' AND (persona_id = ? OR persona_id IS NULL)';
    params.push(personaId);
  }
  query += ' GROUP BY type ORDER BY count DESC';
  const [rows] = await pool.execute(query, params);

  const [totalRows] = await pool.execute(
    'SELECT COUNT(*) as total, SUM(size) as total_size FROM media_library WHERE status = ?',
    ['ready']
  );

  return {
    byType: rows.reduce((acc, r) => { acc[r.type] = { count: r.count, totalSize: r.total_size || 0 }; return acc; }, {}),
    total: totalRows[0].total || 0,
    totalSize: totalRows[0].total_size || 0,
  };
}

async function extractVideoMetadata(filePath) {
  return new Promise((resolve) => {
    const ffprobe = process.env.FFPROBE_PATH || 'ffprobe';
    execFile(ffprobe, [
      '-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams',
      filePath
    ], { timeout: 10000 }, (err, stdout) => {
      if (err) return resolve(null);
      try {
        const data = JSON.parse(stdout);
        const video = (data.streams || []).find(s => s.codec_type === 'video');
        const audio = (data.streams || []).find(s => s.codec_type === 'audio');
        const duration = parseFloat(data.format?.duration || video?.duration || 0);
        const result = { duration: duration || null };
        if (video) {
          result.width = video.width || null;
          result.height = video.height || null;
          result.codec = video.codec_name || null;
          result.fps = video.r_frame_rate ? video.r_frame_rate.split('/')[0] : null;
        }
        if (audio) result.hasAudio = true;
        resolve(result);
      } catch { resolve(null); }
    });
  });
}

async function generateVideoThumbnail(filePath, outputPath) {
  return new Promise((resolve) => {
    const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
    execFile(ffmpeg, [
      '-y', '-ss', '2', '-i', filePath,
      '-vframes', '1', '-q:v', '4',
      '-vf', 'scale=320:-1',
      outputPath
    ], { timeout: 15000 }, (err) => {
      if (err) return resolve(false);
      resolve(fs.existsSync(outputPath));
    });
  });
}

async function createMediaFromUpload(file, { persona_id, owner_id, title, description, alt_text, caption, tags, folder }) {
  const ext = getExtension(file.originalname);
  const filename = file.filename || (Date.now().toString(36) + ext);
  const mimetype = file.mimetype || 'application/octet-stream';
  const size = file.size || 0;
  const url = `/uploads/media/${filename}`;
  const mediaType = getMediaType(mimetype, ext);

  const metadata = {};
  if (mediaType === 'image') {
    metadata.width = null;
    metadata.height = null;
  }
  if (mediaType === 'video' || mediaType === 'audio') {
    metadata.duration = null;
  }

  const filePath = path.join(UPLOAD_DIR, filename);

  if (mediaType === 'video' && fs.existsSync(filePath)) {
    const videoMeta = await extractVideoMetadata(filePath);
    if (videoMeta) {
      metadata.width = videoMeta.width;
      metadata.height = videoMeta.height;
      metadata.duration = videoMeta.duration;
      metadata.codec = videoMeta.codec;
      metadata.hasAudio = videoMeta.hasAudio || false;
    }
    const thumbFilename = 'thumb_' + path.basename(filename, ext) + '.jpg';
    const thumbPath = path.join(UPLOAD_DIR, thumbFilename);
    const thumbOk = await generateVideoThumbnail(filePath, thumbPath);
    if (thumbOk) {
      metadata.thumbnail = `/uploads/media/${thumbFilename}`;
    }
  }

  return createMedia({
    persona_id,
    owner_id,
    title: title || path.basename(file.originalname, ext),
    description,
    filename,
    original_name: file.originalname,
    mimetype,
    size,
    url,
    type: mediaType,
    alt_text,
    caption,
    metadata,
    tags: tags || [],
    folder,
    source: 'upload',
  });
}

function deserializeMedia(row) {
  return {
    id: row.id,
    persona_id: row.persona_id,
    owner_id: row.owner_id,
    title: row.title,
    description: row.description,
    filename: row.filename,
    original_name: row.original_name,
    mimetype: row.mimetype,
    size: row.size,
    url: row.url,
    type: row.type,
    alt_text: row.alt_text,
    caption: row.caption,
    metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {}),
    tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : (row.tags || []),
    folder: row.folder,
    source: row.source,
    status: row.status,
    views: row.views || 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

module.exports = {
  createMedia,
  getMedia,
  listMedia,
  updateMedia,
  deleteMedia,
  incrementViews,
  getMediaByFolder,
  getMediaFolders,
  getMediaStats,
  createMediaFromUpload,
  extractVideoMetadata,
  generateVideoThumbnail,
  getMediaType,
  getExtension,
  UPLOAD_DIR,
  MEDIA_TYPES,
  MEDIA_STATUS,
};