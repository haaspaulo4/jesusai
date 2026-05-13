const axios = require('axios');

async function apiIngester(sourceConfig) {
  const { url, method, headers, body, dataPath, textField, referenceField, cacheEnabled } = sourceConfig;

  if (!url) {
    throw new Error('API source requires a "url" in config');
  }

  console.log(`Fetching data from API: ${url}...`);

  const requestConfig = {
    method: method || 'GET',
    url,
    headers: headers || {},
    timeout: sourceConfig.timeout || 30000,
  };

  if (body) {
    requestConfig.data = body;
  }

  const response = await axios(requestConfig);
  let data = response.data;

  if (dataPath) {
    const parts = dataPath.split('.');
    for (const part of parts) {
      if (data == null) break;
      data = data[part];
      if (Array.isArray(data)) break;
    }
  }

  const documents = Array.isArray(data) ? data : [data];

  const tField = textField || 'text';
  const rField = referenceField || 'reference';

  const processed = documents
    .filter(doc => {
      const text = doc[tField] || doc.text || doc.content || doc.description || '';
      return text.trim().length > 0;
    })
    .map((doc, i) => {
      const text = doc[tField] || doc.text || doc.content || doc.description || '';
      const ref = doc[rField] || doc.id || doc.title || doc.name || `API doc ${i + 1}`;
      return {
        id: doc.id || `api_${i}`,
        reference: ref,
        text: text.trim(),
        source: url,
        type: 'api',
        url,
        ...doc,
      };
    })
    .filter(doc => doc.text.length > 0);

  console.log(`Fetched ${processed.length} documents from API: ${url}`);
  return processed;
}

module.exports = apiIngester;