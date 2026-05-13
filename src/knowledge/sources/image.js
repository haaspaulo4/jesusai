const fs = require('fs');
const path = require('path');
const Tesseract = require('tesseract.js');

async function imageIngester(sourceConfig) {
  const filePath = sourceConfig.filePath;

  if (!filePath) {
    throw new Error('Image source requires a "filePath" in config');
  }

  const resolved = path.resolve(filePath);

  if (!fs.existsSync(resolved)) {
    throw new Error(`Image file not found: ${resolved}`);
  }

  const lang = sourceConfig.ocrLang || 'por+eng';
  const chunkSize = sourceConfig.chunkSize || 1500;
  const chunkOverlap = sourceConfig.chunkOverlap || 300;

  console.log(`Running OCR on image: ${resolved} (lang: ${lang})...`);

  const worker = await Tesseract.createWorker(lang);
  const { data: { text } } = await worker.recognize(resolved);
  await worker.terminate();

  if (!text || text.trim().length === 0) {
    console.warn(`No text detected in image: ${resolved}`);
    return [];
  }

  const chunks = chunkText(text, chunkSize, chunkOverlap);
  const documents = chunks.map((chunk, i) => ({
    id: `${path.basename(resolved, path.extname(resolved))}_chunk_${i}`,
    reference: `${path.basename(resolved)} (OCR)${chunks.length > 1 ? ` parte ${i + 1}/${chunks.length}` : ''}`,
    text: chunk,
    source: path.basename(resolved),
    type: 'image',
    chunk: i,
    totalChunks: chunks.length,
  }));

  console.log(`Extracted ${documents.length} chunks from image via OCR`);
  return documents;
}

function chunkText(text, size, overlap) {
  const cleaned = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (cleaned.length <= size) return [cleaned];

  const chunks = [];
  let start = 0;
  while (start < cleaned.length) {
    let end = start + size;
    if (end < cleaned.length) {
      const lastBreak = cleaned.lastIndexOf('\n', end);
      if (lastBreak > start + size * 0.5) end = lastBreak;
      const lastPeriod = cleaned.lastIndexOf('. ', end);
      if (lastPeriod > start + size * 0.5) end = lastPeriod + 1;
    }
    const chunk = cleaned.substring(start, end).trim();
    if (chunk.length > 0) chunks.push(chunk);
    start = end - overlap;
    if (start >= cleaned.length) break;
  }
  return chunks;
}

module.exports = imageIngester;