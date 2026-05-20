const express = require('express');
const router = express.Router();
const { adminMiddleware } = require('./middleware');
const admin = require('../../admin');

router.get('/knowledge', adminMiddleware, async (req, res) => {
  try {
    const { getAllSourceStats } = require('../../knowledge/store');
    const sources = await getAllSourceStats();
    const { vectorStore } = require('../../embeddings/vectorStore');
    const vectorStats = await vectorStore.getStats();
    res.json({
      sources,
      totalSources: sources.length,
      totalDocuments: sources.reduce((sum, s) => sum + s.documentCount, 0),
      vectorSearch: vectorStats,
    });
  } catch (err) {
    console.error('[Admin] Knowledge stats error:', err);
    res.status(500).json({ error: 'Failed to get knowledge stats' });
  }
});

router.post('/knowledge/reindex', adminMiddleware, async (req, res) => {
  try {
    const result = await admin.reindexKnowledge();

    const { vectorStore } = require('../../embeddings/vectorStore');
    let vectorResult = null;
    try {
      vectorResult = await vectorStore.indexAllSources();
    } catch (vecErr) {
      console.warn('[Admin] Vector reindex warning:', vecErr.message);
    }

    res.json({ ...result, vectorReindex: vectorResult });
  } catch (err) {
    console.error('[Admin] Reindex error:', err);
    res.status(500).json({ error: 'Failed to reindex' });
  }
});

router.post('/knowledge/upload', adminMiddleware, async (req, res) => {
  try {
    const multer = require('multer');
    const path = require('path');
    const { UPLOADS_DIR } = require('../../knowledge/config');

    const storage = multer.diskStorage({
      destination: (req, file, cb) => cb(null, UPLOADS_DIR),
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
      },
    });
    const upload = multer({
      storage,
      limits: { fileSize: 50 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        const allowed = ['.pdf', '.docx', '.png', '.jpg', '.jpeg', '.webp', '.tiff', '.bmp', '.mp3', '.wav', '.ogg', '.webm', '.m4a', '.flac', '.txt', '.md', '.json'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext) || file.mimetype === 'application/json') {
          cb(null, true);
        } else {
          cb(new Error(`Unsupported file type: ${ext}`));
        }
      },
    });

    upload.single('file')(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const { sourceId, sourceName, ingester } = req.body;
      const id = sourceId || path.basename(req.file.originalname, path.extname(req.file.originalname)).replace(/[^a-zA-Z0-9_-]/g, '_');
      const name = sourceName || id;

      const extToType = {
        '.pdf': 'pdf', '.docx': 'docx', '.png': 'image', '.jpg': 'image', '.jpeg': 'image',
        '.webp': 'image', '.tiff': 'image', '.bmp': 'image',
        '.mp3': 'audio', '.wav': 'audio', '.ogg': 'audio', '.webm': 'audio', '.m4a': 'audio', '.flac': 'audio',
        '.txt': 'text', '.md': 'text', '.json': 'json',
      };
      const ext = path.extname(req.file.originalname).toLowerCase();
      const fileType = ingester || extToType[ext] || 'text';

      try {
        const { ingestUploadedFile } = require('../../knowledge/ingester');
        const documents = await ingestUploadedFile(req.file.path, id, fileType);

        if (!documents || documents.length === 0) {
          return res.status(400).json({ error: 'No text extracted from file' });
        }

        const { saveUploadedSource } = require('../../knowledge/config');
        const dataPath = path.join(UPLOADS_DIR, `${id}_documents.json`);
        const indexPath = path.join(UPLOADS_DIR, `${id}_index.json`);

        const fs = require('fs');
        fs.writeFileSync(dataPath, JSON.stringify(documents), 'utf-8');

        const { KnowledgeStore } = require('../../knowledge/store');
        const sourceConfig = {
          id,
          name,
          type: fileType,
          enabled: true,
          dataPath,
          indexPath,
          searchFields: ['reference', 'text'],
          defaultTopK: 8,
          contextTemplate: {
            'pt-BR': 'CONTEXTO ENCONTRADO:\n{context}\n\nUse esta informação como base para sua resposta.',
            'en-US': 'CONTEXT FOUND:\n{context}\n\nUse this information as the basis for your response.',
            'es-ES': 'CONTEXTO ENCONTRADO:\n{context}\n\nUsa esta información como base para tu respuesta.',
          },
          sourceFormat: (docs) => docs.map(d => `${d.reference}: "${d.text}"`).join('\n'),
          ingester: fileType,
          filePath: req.file.path,
        };

        saveUploadedSource(sourceConfig);

        const store = new KnowledgeStore(sourceConfig);
        store.buildIndex();

        res.json({
          success: true,
          sourceId: id,
          name,
          type: fileType,
          documents: documents.length,
          message: `Ingested ${documents.length} documents from ${req.file.originalname}`,
        });
      } catch (ingestErr) {
        console.error('[Admin] Upload ingestion error:', ingestErr);
        res.status(500).json({ error: `Ingestion failed: ${ingestErr.message}` });
      }
    });
  } catch (err) {
    console.error('[Admin] Upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/knowledge/sources/:sourceId', adminMiddleware, async (req, res) => {
  try {
    const { removeUploadedSource, invalidateCache } = require('../../knowledge/config');
    removeUploadedSource(req.params.sourceId);
    invalidateCache();
    res.json({ ok: true });
  } catch (err) {
    console.error('[Admin] Delete knowledge source error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/vector-stats', adminMiddleware, async (req, res) => {
  try {
    const { vectorStore } = require('../../embeddings/vectorStore');
    const stats = await vectorStore.getStats();
    res.json(stats);
  } catch (err) {
    console.error('[Admin] Vector stats error:', err);
    res.status(500).json({ error: 'Failed to get vector stats' });
  }
});

router.post('/vector-reindex', adminMiddleware, async (req, res) => {
  try {
    const { vectorStore } = require('../../embeddings/vectorStore');
    const { sourceId } = req.body;

    let result;
    if (sourceId) {
      result = await vectorStore.indexSource(sourceId);
    } else {
      result = await vectorStore.indexAllSources();
    }

    res.json({ success: true, result });
  } catch (err) {
    console.error('[Admin] Vector reindex error:', err);
    res.status(500).json({ error: 'Failed to reindex vectors' });
  }
});

module.exports = router;
