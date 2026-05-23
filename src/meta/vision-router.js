/**
 * src/meta/vision-router.js
 *
 * Vision Router for Meta-Persona + Pet
 * 
 * Handles image input (base64, url, buffer) BEFORE sending to text-only LLMs.
 * Routes to vision-capable models (Claude, Groq vision, Ollama llava, etc.)
 * or falls back gracefully.
 */

const integrationManager = require('../llm/integrationManager');

const logger = (msg) => console.log(`[VisionRouter] ${msg}`);

/**
 * Main exported function called by chat engine and pet.
 * @param {string|object} message - Can be string or {text, image, imageBase64}
 * @param {object} context - {userId, sessionId, personaId}
 * @returns {Promise<{text: string, description?: string, confidence?: number}>}
 */
async function handleVisionIfNeeded(message, context = {}) {
  try {
    let imageData = null;
    let userText = '';

    if (typeof message === 'string') {
      userText = message;
      // crude detection for image urls in text
      const urlMatch = message.match(/https?:\/\/\S+\.(png|jpg|jpeg|webp|gif)/i);
      if (urlMatch) imageData = { url: urlMatch[0] };
    } else if (message && typeof message === 'object') {
      userText = message.text || message.content || '';
      imageData = message.image || message.imageBase64 || message.file || null;
      if (typeof imageData === 'string' && imageData.startsWith('http')) {
        imageData = { url: imageData };
      }
    }

    if (!imageData) {
      return { text: userText || '[No image provided]' };
    }

    logger(`Processing image for persona=${context.personaId || 'default'}`);

    // Build a vision-capable prompt
    const visionPrompt = `Descreva esta imagem de forma clara e detalhada em português. Foque em objetos, texto, pessoas, contexto e qualquer informação útil para um assistente administrativo (Meta-Persona). Seja objetivo.`;

    // Prepare message for multimodal LLM
    const visionMessages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: visionPrompt + (userText ? `\n\nPergunta do usuário: ${userText}` : '') },
          typeof imageData === 'string'
            ? { type: 'image_url', image_url: { url: imageData.startsWith('data:') ? imageData : `data:image/jpeg;base64,${imageData}` } }
            : imageData.url
              ? { type: 'image_url', image_url: { url: imageData.url } }
              : { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageData}` } }
        ]
      }
    ];

    // Force vision through Claude (best image support). Fall back gracefully if Claude is unavailable.
    let result;
    try {
      // We use the public callLLM — the IntegrationManager will try Claude if configured.
      // If the chosen model still doesn't support images, we catch and give a clear message.
      result = await integrationManager.callLLM(visionMessages, {
        temperature: 0.3,
        numPredict: 1024,
        timeout: 45000
      });
    } catch (err) {
      const msg = err.message || '';
      logger(`Vision call failed: ${msg}`);

      if (msg.includes('image') || msg.includes('vision') || msg.includes('does not support')) {
        return {
          text: userText 
            ? `${userText}\n\n[Imagem recebida: image.png] — O modelo atual não suporta análise de imagens. Descreva o que você quer que eu faça com ela.`
            : 'Você enviou uma imagem (image.png). O modelo atual não suporta visão. Me diga o que devo fazer com ela.',
          description: 'Modelo sem suporte a imagens',
          error: 'no_vision_support'
        };
      }

      return {
        text: userText || '[Imagem enviada — não foi possível analisar agora]',
        description: 'Falha ao processar imagem',
        error: msg
      };
    }

    const description = result?.message?.content || result?.content || 'Imagem processada (sem descrição textual disponível).';

    const combined = userText
      ? `${userText}\n\n[Visão da imagem]: ${description}`
      : `[Visão da imagem]: ${description}`;

    return {
      text: combined,
      description,
      confidence: 0.85
    };
  } catch (err) {
    logger(`Vision routing error: ${err.message}`);
    return {
      text: typeof message === 'string' ? message : (message?.text || '[Imagem enviada — não foi possível analisar agora]'),
      description: 'Falha ao processar imagem',
      error: err.message
    };
  }
}

module.exports = {
  handleVisionIfNeeded
};
