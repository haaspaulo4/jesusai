require('dotenv').config();
const { runIngestion } = require('../src/knowledge/ingester');

runIngestion()
  .then(() => {
    console.log('\nIngestion complete!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Ingestion failed:', err);
    process.exit(1);
  });