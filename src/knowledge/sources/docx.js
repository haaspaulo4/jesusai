const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');

async function docxIngester(sourceConfig) {
  const filePath = sourceConfig.filePath;

  if (!filePath) {
    throw new Error('DOCX source requires a "filePath" in config');
  }

  const resolved = path.resolve(filePath);

  if (!fs.existsSync(resolved)) {
    throw new Error(`DOCX file not found: ${resolved}`);
  }

  console.log(`Extracting text from DOCX: ${resolved}...`);

  const result = await mammoth.extractRawText({ path: resolved });
  const rawText = result.value;

  const chunkSize = sourceConfig.chunkSize || 1500;
  const chunkOverlap = sourceConfig.chunkOverlap || 300;

  const chunks = chunkText(rawText, chunkSize, chunkOverlap);
  const documents = chunks.map((chunk, i) => ({
    id: `${path.basename(resolved, '.docx')}_chunk_${i}`,
    reference: `${path.basename(resolved)}${chunks.length > 1 ? ` (parte ${i + 1}/${chunks.length})` : ''}`,
    text: chunk,
    source: path.basename(resolved),
    type: 'docx',
    chunk: i,
    totalChunks: chunks.length,
  }));

  console.log(`Extracted ${documents.length} chunks from DOCX`);
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

module.exports = docxIngester;