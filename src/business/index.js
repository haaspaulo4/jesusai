const { pool } = require('../db');
const personaManager = require('../persona/manager');

const BUSINESS_CONFIG_DEFAULTS = {
  name: '',
  tagline: '',
  description: '',
  logo_url: '',
  cover_url: '',
  website: '',
  email: '',
  phone: '',
  whatsapp: '',
  address: '',
  city: '',
  state: '',
  country: '',
  zip: '',
  coordinates: null,
  business_hours: {
    mon: { open: '09:00', close: '18:00' },
    tue: { open: '09:00', close: '18:00' },
    wed: { open: '09:00', close: '18:00' },
    thu: { open: '09:00', close: '18:00' },
    fri: { open: '09:00', close: '18:00' },
    sat: { open: null, close: null },
    sun: { open: null, close: null },
  },
  services: [],
  products: [],
  faq: [],
  pricing: [],
  social: {
    instagram: '',
    facebook: '',
    linkedin: '',
    youtube: '',
    twitter: '',
    tiktok: '',
    website: '',
  },
  payment_methods: [],
  delivery_info: '',
  policies: {
    refund: '',
    privacy: '',
    terms: '',
  },
  branding: {
    primary_color: '',
    secondary_color: '',
    accent_color: '',
    font_family: '',
    tone: '',
    slogan: '',
  },
  scheduling: {
    enabled: false,
    interval: 30,
    work_days: ['mon', 'tue', 'wed', 'thu', 'fri'],
    work_hours: { start: '09:00', end: '18:00' },
    blocked_dates: [],
  },
  highlights: [],
  certifications: [],
  team: [],
};

async function getBusinessConfig(personaId) {
  const persona = await personaManager.getPersona(personaId);
  if (!persona) return null;
  const config = persona.businessConfig || {};
  return { ...BUSINESS_CONFIG_DEFAULTS, ...config };
}

async function updateBusinessConfig(personaId, updates) {
  const persona = await personaManager.getPersona(personaId);
  if (!persona) throw new Error('Persona not found');
  const current = persona.businessConfig || {};
  const merged = deepMerge(current, updates);
  await personaManager.createPersona({ id: personaId, business_config: merged });
  personaManager.invalidateCache();
  return merged;
}

async function resetBusinessConfig(personaId) {
  await personaManager.createPersona({ id: personaId, business_config: BUSINESS_CONFIG_DEFAULTS });
  personaManager.invalidateCache();
  return BUSINESS_CONFIG_DEFAULTS;
}

function formatBusinessContext(config) {
  if (!config) return '';
  const parts = [];

  if (config.name) parts.push(`BUSINESS: ${config.name}`);
  if (config.tagline) parts.push(`Tagline: ${config.tagline}`);
  if (config.description) parts.push(`Description: ${config.description}`);

  if (config.phone || config.email || config.whatsapp) {
    const contact = [];
    if (config.phone) contact.push(`Phone: ${config.phone}`);
    if (config.email) contact.push(`Email: ${config.email}`);
    if (config.whatsapp) contact.push(`WhatsApp: ${config.whatsapp}`);
    parts.push(`CONTACT: ${contact.join(', ')}`);
  }

  if (config.address || config.city) {
    const addr = [config.address, config.city, config.state, config.zip].filter(Boolean).join(', ');
    parts.push(`ADDRESS: ${addr}`);
  }

  if (config.business_hours) {
    const hours = Object.entries(config.business_hours)
      .map(([day, h]) => `${day}: ${h.open || 'Closed'}-${h.close || 'Closed'}`)
      .join('; ');
    parts.push(`BUSINESS HOURS: ${hours}`);
  }

  if (config.services && config.services.length > 0) {
    parts.push(`SERVICES:\n${config.services.map(s => typeof s === 'object' ? `- ${s.name}${s.description ? ': ' + s.description : ''}${s.price ? ' (R$' + s.price + ')' : ''}` : `- ${s}`).join('\n')}`);
  }

  if (config.products && config.products.length > 0) {
    parts.push(`PRODUCTS:\n${config.products.map(p => typeof p === 'object' ? `- ${p.name}${p.description ? ': ' + p.description : ''}${p.price ? ' (R$' + p.price + ')' : ''}` : `- ${p}`).join('\n')}`);
  }

  if (config.faq && config.faq.length > 0) {
    parts.push(`FAQ:\n${config.faq.map(f => typeof f === 'object' ? `Q: ${f.question}\nA: ${f.answer}` : f).join('\n\n')}`);
  }

  if (config.pricing && config.pricing.length > 0) {
    parts.push(`PRICING:\n${config.pricing.map(p => typeof p === 'object' ? `- ${p.name}: R$${p.price}${p.description ? ' - ' + p.description : ''}` : `- ${p}`).join('\n')}`);
  }

  if (config.payment_methods && config.payment_methods.length > 0) {
    parts.push(`PAYMENT METHODS: ${config.payment_methods.join(', ')}`);
  }

  if (config.policies) {
    const policies = [];
    if (config.policies.refund) policies.push(`Refund: ${config.policies.refund}`);
    if (config.policies.privacy) policies.push(`Privacy: ${config.policies.privacy}`);
    if (config.policies.terms) policies.push(`Terms: ${config.policies.terms}`);
    if (policies.length) parts.push(`POLICIES:\n${policies.join('\n')}`);
  }

  if (config.social) {
    const socials = Object.entries(config.social).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`);
    if (socials.length) parts.push(`SOCIAL: ${socials.join(', ')}`);
  }

  if (config.team && config.team.length > 0) {
    parts.push(`TEAM:\n${config.team.map(t => typeof t === 'object' ? `- ${t.name}${t.role ? ' (' + t.role + ')' : ''}` : `- ${t}`).join('\n')}`);
  }

  if (config.highlights && config.highlights.length > 0) {
    parts.push(`HIGHLIGHTS: ${config.highlights.join(', ')}`);
  }

  return parts.length > 0 ? `BUSINESS INFORMATION:\n${parts.join('\n\n')}` : '';
}

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) && source[key] !== null) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

function isOpenNow(config) {
  if (!config || !config.business_hours) return null;
  const now = new Date();
  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const day = days[now.getDay()];
  const hours = config.business_hours[day];
  if (!hours || !hours.open || !hours.close) return false;
  const [oh, om] = hours.open.split(':').map(Number);
  const [ch, cm] = hours.close.split(':').map(Number);
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const openMins = oh * 60 + om;
  const closeMins = ch * 60 + cm;
  return nowMins >= openMins && nowMins <= closeMins;
}

module.exports = {
  getBusinessConfig,
  updateBusinessConfig,
  resetBusinessConfig,
  formatBusinessContext,
  BUSINESS_CONFIG_DEFAULTS,
  isOpenNow,
};