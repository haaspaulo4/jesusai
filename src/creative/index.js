require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../db');
const Handlebars = require('handlebars');

const CREATIVE_DIR = path.join(__dirname, '..', '..', 'data', 'creative');
const TEMPLATES_DIR = path.join(CREATIVE_DIR, 'templates');
const OUTPUT_DIR = path.join(CREATIVE_DIR, 'output');

const POST_SIZES = {
  instagram_post: { width: 1080, height: 1080 },
  instagram_story: { width: 1080, height: 1920 },
  instagram_carousel: { width: 1080, height: 1350 },
  facebook_post: { width: 1200, height: 630 },
  twitter_post: { width: 1200, height: 675 },
  linkedin_post: { width: 1200, height: 627 },
  youtube_thumbnail: { width: 1280, height: 720 },
  blog_banner: { width: 1920, height: 600 },
  ebook_cover: { width: 1600, height: 2400 },
  story_facebook: { width: 1080, height: 1920 },
  pinterest_pin: { width: 1000, height: 1500 },
  whatsapp_status: { width: 1080, height: 1920 },
};

const DEFAULT_FONTS = {
  heading: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
  body: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
  accent: "'Georgia', 'Times New Roman', serif",
};

const TEMPLATES = {
  quote_post: {
    name: 'Quote Post',
    description: 'Elegant quote card for social media',
    size: 'instagram_post',
    html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { width: {{width}}px; height: {{height}}px; display: flex; align-items: center; justify-content: center; font-family: {{fonts.heading}}; }
.container { width: 100%; height: 100%; background: linear-gradient({{gradientDirection}}, {{primaryColor}}, {{secondaryColor}}); display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 80px; }
.quote-mark { font-size: 120px; color: {{accentColor}}; opacity: 0.3; line-height: 1; margin-bottom: -40px; }
.text { font-size: {{textSize}}px; color: {{textColor}}; text-align: center; line-height: 1.4; font-weight: 600; max-width: 90%; }
.author { font-size: {{authorSize}}px; color: {{textColor}}; opacity: 0.85; margin-top: 40px; font-family: {{fonts.accent}}; font-style: italic; }
.brand { font-size: 18px; color: {{textColor}}; opacity: 0.6; margin-top: 60px; }
{{#if brandLogo}}
.brand-logo { position: absolute; bottom: 40px; left: 50%; transform: translateX(-50%); height: 36px; opacity: 0.7; }
{{/if}}
</style></head><body>
<div class="container">
  <div class="quote-mark">"</div>
  <div class="text">{{text}}</div>
  <div class="author">{{#if author}}— {{author}}{{/if}}</div>
  {{#if brandLogo}}<img class="brand-logo" src="{{brandLogo}}" />{{/if}}
  <div class="brand">{{brandName}}</div>
</div>
</body></html>`,
  },

  announcement_post: {
    name: 'Announcement Post',
    description: 'Bold announcement card with title and CTA',
    size: 'instagram_post',
    html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { width: {{width}}px; height: {{height}}px; font-family: {{fonts.heading}}; }
.container { width: 100%; height: 100%; background: linear-gradient({{gradientDirection}}, {{primaryColor}}, {{secondaryColor}}); display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px; }
.tag { font-size: 18px; color: {{accentColor}}; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 30px; }
.title { font-size: {{textSize}}px; color: {{textColor}}; text-align: center; line-height: 1.2; font-weight: 800; }
.subtitle { font-size: {{authorSize}}px; color: {{textColor}}; opacity: 0.8; text-align: center; margin-top: 30px; line-height: 1.5; }
.cta { margin-top: 50px; padding: 18px 48px; background: {{accentColor}}; color: {{primaryColor}}; font-size: 20px; font-weight: 700; border-radius: 12px; }
.brand { font-size: 16px; color: {{textColor}}; opacity: 0.5; margin-top: 40px; }
</style></head><body>
<div class="container">
  {{#if tag}}<div class="tag">{{tag}}</div>{{/if}}
  <div class="title">{{title}}</div>
  {{#if subtitle}}<div class="subtitle">{{subtitle}}</div>{{/if}}
  {{#if ctaText}}<div class="cta">{{ctaText}}</div>{{/if}}
  <div class="brand">{{brandName}}</div>
</div>
</body></html>`,
  },

  carousel_slide: {
    name: 'Carousel Slide',
    description: 'Content slide for carousel posts',
    size: 'instagram_carousel',
    html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { width: {{width}}px; height: {{height}}px; font-family: {{fonts.heading}}; }
.container { width: 100%; height: 100%; background: {{primaryColor}}; display: flex; flex-direction: column; padding: 60px; }
.slide-number { font-size: 16px; color: {{accentColor}}; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 30px; }
.title { font-size: {{textSize}}px; color: {{textColor}}; font-weight: 800; line-height: 1.2; margin-bottom: 30px; }
.body-text { font-size: {{authorSize}}px; color: {{textColor}}; opacity: 0.85; line-height: 1.6; }
.divider { width: 60px; height: 4px; background: {{accentColor}}; margin: 30px 0; }
{{#if bulletPoints}}
.bullets { list-style: none; }
.bullets li { font-size: 22px; color: {{textColor}}; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.1); }
.bullets li::before { content: "•"; color: {{accentColor}}; margin-right: 12px; }
{{/if}}
.brand { position: absolute; bottom: 40px; font-size: 14px; color: {{textColor}}; opacity: 0.5; }
</style></head><body>
<div class="container">
  <div class="slide-number">{{slideNumber}} de {{totalSlides}}</div>
  <div class="title">{{title}}</div>
  <div class="divider"></div>
  <div class="body-text">{{body}}</div>
  {{#if bulletPoints}}
  <ul class="bullets">
    {{#each bulletPoints}}<li>{{this}}</li>{{/each}}
  </ul>
  {{/if}}
  <div class="brand">{{brandName}}</div>
</div>
</body></html>`,
  },

  minimal_blog: {
    name: 'Minimal Blog Cover',
    description: 'Clean blog cover image',
    size: 'blog_banner',
    html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { width: {{width}}px; height: {{height}}px; font-family: {{fonts.heading}}; }
.container { width: 100%; height: 100%; background: {{primaryColor}}; display: flex; flex-direction: row; }
.content { flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 80px; }
.tag { font-size: 14px; color: {{accentColor}}; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 24px; }
.title { font-size: {{textSize}}px; color: {{textColor}}; font-weight: 800; line-height: 1.2; margin-bottom: 20px; }
.subtitle { font-size: {{authorSize}}px; color: {{textColor}}; opacity: 0.7; line-height: 1.5; }
.accent-bar { position: absolute; right: 0; top: 0; width: 8px; height: 100%; background: {{accentColor}}; }
</style></head><body>
<div class="container">
  <div class="content">
    {{#if tag}}<div class="tag">{{tag}}</div>{{/if}}
    <div class="title">{{title}}</div>
    {{#if subtitle}}<div class="subtitle">{{subtitle}}</div>{{/if}}
  </div>
  <div class="accent-bar"></div>
</div>
</body></html>`,
  },
};

Handlebars.registerHelper('if', function(conditional, options) {
  if (conditional) return options.fn(this);
  return options.inverse(this);
});

Handlebars.registerHelper('each', function(context, options) {
  if (!context || !Array.isArray(context)) return '';
  return context.map(item => options.fn(item)).join('');
});

function compileTemplate(templateId, data) {
  const templateDef = TEMPLATES[templateId];
  if (!templateDef) throw new Error(`Template not found: ${templateId}`);

  const size = POST_SIZES[data.size || templateDef.size] || POST_SIZES.instagram_post;

  const defaults = {
    width: size.width,
    height: size.height,
    primaryColor: '#1a1a2e',
    secondaryColor: '#16213e',
    accentColor: '#e94560',
    textColor: '#ffffff',
    gradientDirection: '135deg',
    text: 'Your text here',
    textSize: Math.round(size.width / 22),
    authorSize: Math.round(size.width / 40),
    title: '',
    subtitle: '',
    author: '',
    brandName: 'MetaPersona.AI',
    fonts: DEFAULT_FONTS,
    tag: '',
    ctaText: '',
    slideNumber: 1,
    totalSlides: 5,
    body: '',
    bulletPoints: null,
    brandLogo: null,
  };

  const merged = { ...defaults, ...data };
  const compiled = Handlebars.compile(templateDef.html);
  return compiled(merged);
}

async function saveCreative(personaId, ownerId, type, templateId, data, html) {
  const id = `creative_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const htmlPath = path.join(OUTPUT_DIR, `${id}.html`);

  fs.writeFileSync(htmlPath, html, 'utf-8');

  await pool.execute(
    `INSERT INTO creatives (id, persona_id, owner_id, type, template_id, data, html_path, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
    [id, personaId, ownerId, type, templateId, JSON.stringify(data), htmlPath]
  );

  return { id, htmlPath, type, templateId };
}

async function listCreatives(personaId, ownerId, type = null, limit = 20) {
  let query = 'SELECT * FROM creatives WHERE persona_id = ? AND owner_id = ?';
  const params = [personaId, ownerId];

  if (type) {
    query += ' AND type = ?';
    params.push(type);
  }

  query += ` ORDER BY created_at DESC LIMIT ${Number(limit)}`;
  const [rows] = await pool.execute(query, params);
  return rows;
}

async function getCreative(id) {
  const [rows] = await pool.execute('SELECT * FROM creatives WHERE id = ?', [id]);
  return rows[0] || null;
}

async function deleteCreative(id) {
  const creative = await getCreative(id);
  if (creative?.html_path && fs.existsSync(creative.html_path)) {
    fs.unlinkSync(creative.html_path);
  }
  await pool.execute('DELETE FROM creatives WHERE id = ?', [id]);
  return true;
}

function getAvailableTemplates() {
  return Object.entries(TEMPLATES).map(([id, t]) => ({
    id,
    name: t.name,
    description: t.description,
    size: t.size,
    dimensions: POST_SIZES[t.size],
  }));
}

function getAvailableSizes() {
  return Object.entries(POST_SIZES).map(([id, size]) => ({
    id,
    width: size.width,
    height: size.height,
  }));
}

function generateWithLLM(personaContext, prompt, contentType) {
  const prompts = {
    quote: `Generate an inspiring quote for a social media post based on: "${prompt}". Context: ${personaContext}. Return JSON: { "text": "quote text", "author": "author name" }`,
    announcement: `Generate an announcement title and subtitle for: "${prompt}". Context: ${personaContext}. Return JSON: { "tag": "category tag", "title": "main title", "subtitle": "supporting text", "ctaText": "call to action" }`,
    carousel: `Generate carousel slide content for: "${prompt}". Context: ${personaContext}. Return JSON: { "title": "slide title", "body": "slide body text", "bulletPoints": ["point1", "point2", "point3"] }`,
    blog: `Generate a blog cover title and subtitle for: "${prompt}". Context: ${personaContext}. Return JSON: { "tag": "category", "title": "blog title", "subtitle": "supporting text" }`,
  };

  return prompts[contentType] || prompts.quote;
}

module.exports = {
  compileTemplate,
  saveCreative,
  listCreatives,
  getCreative,
  deleteCreative,
  getAvailableTemplates,
  getAvailableSizes,
  generateWithLLM,
  TEMPLATES,
  POST_SIZES,
  CREATIVE_DIR,
  TEMPLATES_DIR,
  OUTPUT_DIR,
};