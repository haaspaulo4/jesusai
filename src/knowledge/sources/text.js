const fs = require('fs');
const path = require('path');

function textIngester(sourceConfig) {
  const dirPath = sourceConfig.directoryPath;

  if (!dirPath) {
    throw new Error('Text source requires a "directoryPath" in config');
  }

  const resolved = path.resolve(dirPath);

  if (!fs.existsSync(resolved)) {
    throw new Error(`Directory not found: ${resolved}`);
  }

  const extensions = sourceConfig.extensions || ['.txt', '.md'];
  const chunkSize = sourceConfig.chunkSize || 1000;
  const chunkOverlap = sourceConfig.chunkOverlap || 200;
  const encoding = sourceConfig.encoding || 'utf-8';

  console.log(`Loading text files from ${resolved}...`);

  const documents = [];

  function walkDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (extensions.some(ext => entry.name.endsWith(ext))) {
        const content = fs.readFileSync(fullPath, encoding);
        const relativePath = path.relative(resolved, fullPath);
        const chunks = chunkText(content, chunkSize, chunkOverlap);

        chunks.forEach((chunk, i) => {
          documents.push({
            id: `${relativePath}_chunk_${i}`,
            reference: `${relativePath}${chunks.length > 1 ? ` (parte ${i + 1}/${chunks.length})` : ''}`,
            text: chunk,
            source: relativePath,
            chunk: i,
            totalChunks: chunks.length,
          });
        });
      }
    }
  }

  function chunkText(text, size, overlap) {
    if (text.length <= size) return [text.trim()];

    const chunks = [];
    let start = 0;
    while (start < text.length) {
      let end = start + size;
      if (end < text.length) {
        const lastBreak = text.lastIndexOf('\n', end);
        if (lastBreak > start + size * 0.5) end = lastBreak;
        const lastPeriod = text.lastIndexOf('. ', end);
        if (lastPeriod > start + size * 0.5) end = lastPeriod + 1;
      }
      const chunk = text.substring(start, end).trim();
      if (chunk.length > 0) chunks.push(chunk);
      start = end - overlap;
      if (start >= text.length) break;
    }
    return chunks;
  }

  walkDir(resolved);
  console.log(`Loaded ${documents.length} text chunks from ${resolved}`);
  return documents;
}

module.exports = textIngester;