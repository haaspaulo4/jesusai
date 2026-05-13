require('dotenv').config();
const { ingestBible } = require('../src/rag/ingester');

ingestBible()
  .then(() => {
    console.log('\nIngestion complete!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Ingestion failed:', err);
    process.exit(1);
  });