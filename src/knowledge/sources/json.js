const fs = require('fs');
const path = require('path');

function jsonIngester(sourceConfig) {
  const filePath = sourceConfig.filePath;

  if (!filePath) {
    throw new Error('JSON source requires a "filePath" in config');
  }

  const resolved = path.resolve(filePath);

  if (!fs.existsSync(resolved)) {
    throw new Error(`JSON file not found: ${resolved}`);
  }

  console.log(`Loading JSON documents from ${resolved}...`);
  const raw = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
  const documents = Array.isArray(raw) ? raw : [raw];

  const textField = sourceConfig.textField || 'text';
  const referenceField = sourceConfig.referenceField || 'reference';

  const processed = documents
    .filter(doc => doc[textField] && doc[textField].trim().length > 0)
    .map((doc, i) => ({
      id: doc.id || doc[referenceField] || `doc_${i}`,
      reference: doc[referenceField] || doc.id || `Document ${i + 1}`,
      text: doc[textField].trim(),
      ...doc,
    }))
    .filter(doc => doc.text.length > 0);

  console.log(`Loaded ${processed.length} documents from JSON`);
  return processed;
}

module.exports = jsonIngester;