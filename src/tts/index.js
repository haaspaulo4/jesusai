const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const execFileAsync = promisify(execFile);

const VOICES = {
  antonio: 'pt-BR-AntonioNeural',
  francisca: 'pt-BR-FranciscaNeural',
  thalita: 'pt-BR-ThalitaNeural',
};

const MULTIVOZES_VOICE_MAP = {
  alloy: 'pt-BR-AntonioNeural',
  echo: 'pt-BR-AntonioNeural',
  fable: 'pt-BR-FranciscaNeural',
  onyx: 'pt-BR-AntonioNeural',
  nova: 'pt-BR-ThalitaNeural',
  shimmer: 'pt-BR-FranciscaNeural',
};

const KOKORO_VOICES = {
  'pt-BR': { voice: 'pm_alex', lang_code: 'p' },
  'pt-PT': { voice: 'pm_alex', lang_code: 'p' },
  'en-US': { voice: 'am_adam', lang_code: 'a' },
  'en-GB': { voice: 'bm_george', lang_code: 'b' },
  'es-ES': { voice: 'ef_dora', lang_code: 'e' },
  'es-MX': { voice: 'em_alex', lang_code: 'e' },
  'fr-FR': { voice: 'ff_sarah', lang_code: 'f' },
  'de-DE': { voice: 'dm_david', lang_code: 'd' },
  'it-IT': { voice: 'im_marco', lang_code: 'i' },
  'ja-JP': { voice: 'jm_kazu', lang_code: 'j' },
  'ko-KR': { voice: 'km_minsoo', lang_code: 'k' },
  'zh-CN': { voice: 'zm_xiaobei', lang_code: 'z' },
  'hi-IN': { voice: 'hm_alpha', lang_code: 'h' },
  'ru-RU': { voice: 'rm_dmitri', lang_code: 'r' },
  'nl-NL': { voice: 'nm_bram', lang_code: 'n' },
  'pl-PL': { voice: 'pm_tadek', lang_code: 'p' },
  'ar-SA': { voice: 'am_adam', lang_code: 'a' },
  'tr-TR': { voice: 'em_alex', lang_code: 'e' },
  'sv-SE': { voice: 'nm_bram', lang_code: 'n' },
  'da-DK': { voice: 'nm_bram', lang_code: 'n' },
};

const KOKORO_VOICE_MAP = {
  alloy: 'af_heart',
  echo: 'am_adam',
  fable: 'af_bella',
  onyx: 'am_michael',
  nova: 'af_nova',
  shimmer: 'af_bella',
  rafael: 'pf_dora',
  dora: 'pf_dora',
  alex: 'pm_alex',
  luis: 'pm_luis',
  ana: 'pf_ana',
  guy: 'am_adam',
  michael: 'am_michael',
  george: 'bm_george',
  bella: 'af_bella',
  heart: 'af_heart',
  sarah: 'af_sarah',
  nova_voice: 'af_nova',
  emily: 'af_emily',
  david: 'dm_david',
  marcus: 'dm_marcus',
  marco: 'im_marco',
  lucia: 'if_lucia',
  pierre: 'fm_pierre',
  sarah_fr: 'ff_sarah',
  kazu: 'jm_kazu',
  minsoo: 'km_minsoo',
  xiaobei: 'zm_xiaobei',
  dmitri: 'rm_dmitri',
  bram: 'nm_bram',
  tadek: 'pm_tadek',
};

const KOKORO_EDGE_VOICE_MAP = {
  'pm_alex': 'pt-BR-AntonioNeural',
  'pm_luis': 'pt-BR-AntonioNeural',
  'pf_dora': 'pt-BR-FranciscaNeural',
  'pf_ana': 'pt-BR-ThalitaNeural',
  'am_adam': 'en-US-GuyNeural',
  'am_michael': 'en-US-GuyNeural',
  'am_george': 'en-US-DavisNeural',
  'af_bella': 'en-US-JennyNeural',
  'af_nova': 'en-US-AriaNeural',
  'af_heart': 'en-US-AriaNeural',
  'af_sarah': 'en-US-AriaNeural',
  'af_emily': 'en-US-JennyNeural',
  'bm_george': 'en-GB-ThomasNeural',
  'ef_dora': 'es-ES-ElviraNeural',
  'em_alex': 'es-ES-AlvaroNeural',
  'ff_sarah': 'fr-FR-DeniseNeural',
  'fm_pierre': 'fr-FR-HenriNeural',
  'dm_david': 'de-DE-KillianNeural',
  'dm_marcus': 'de-DE-KillianNeural',
  'if_lucia': 'it-IT-ElsaNeural',
  'im_marco': 'it-IT-DiegoNeural',
  'jm_kazu': 'ja-JP-KeitaNeural',
  'km_minsoo': 'ko-KR-InJoonNeural',
  'zm_xiaobei': 'zh-CN-XiaoxiaoNeural',
  'rm_dmitri': 'ru-RU-DmitriNeural',
  'nm_bram': 'nl-NL-MaartenNeural',
  'pm_tadek': 'pl-PL-MarekNeural',
  'hm_alpha': 'en-US-GuyNeural',
};

const LANG_VOICES = {
  'pt-BR': { default: 'pt-BR-AntonioNeural', voices: ['pt-BR-AntonioNeural', 'pt-BR-FranciscaNeural', 'pt-BR-ThalitaNeural'] },
  'pt-PT': { default: 'pt-PT-DuarteNeural', voices: ['pt-PT-DuarteNeural', 'pt-PT-RaquelNeural'] },
  'en-US': { default: 'en-US-GuyNeural', voices: ['en-US-GuyNeural', 'en-US-JennyNeural', 'en-US-AriaNeural', 'en-US-DavisNeural', 'en-US-JasonNeural', 'en-US-SaraNeural'] },
  'en-GB': { default: 'en-GB-ThomasNeural', voices: ['en-GB-ThomasNeural', 'en-GB-SoniaNeural', 'en-GB-MiaNeural'] },
  'en-AU': { default: 'en-AU-WilliamNeural', voices: ['en-AU-WilliamNeural', 'en-AU-NatashaNeural'] },
  'en-IN': { default: 'en-IN-PrabhatNeural', voices: ['en-IN-PrabhatNeural', 'en-IN-NeerjaNeural'] },
  'es-ES': { default: 'es-ES-AlvaroNeural', voices: ['es-ES-AlvaroNeural', 'es-ES-ElviraNeural'] },
  'es-MX': { default: 'es-MX-JorgeNeural', voices: ['es-MX-JorgeNeural', 'es-MX-DaliaNeural'] },
  'es-AR': { default: 'es-AR-ElenaNeural', voices: ['es-AR-ElenaNeural', 'es-AR-TomasNeural'] },
  'fr-FR': { default: 'fr-FR-HenriNeural', voices: ['fr-FR-HenriNeural', 'fr-FR-DeniseNeural', 'fr-FR-CoralieNeural'] },
  'de-DE': { default: 'de-DE-KillianNeural', voices: ['de-DE-KillianNeural', 'de-DE-KatjaNeural', 'de-DE-ConradNeural'] },
  'it-IT': { default: 'it-IT-DiegoNeural', voices: ['it-IT-DiegoNeural', 'it-IT-ElsaNeural', 'it-IT-GiuseppeNeural'] },
  'ja-JP': { default: 'ja-JP-KeitaNeural', voices: ['ja-JP-KeitaNeural', 'ja-JP-NanamiNeural'] },
  'ko-KR': { default: 'ko-KR-InJoonNeural', voices: ['ko-KR-InJoonNeural', 'ko-KR-SunHiNeural'] },
  'zh-CN': { default: 'zh-CN-YunxiNeural', voices: ['zh-CN-YunxiNeural', 'zh-CN-XiaoxiaoNeural', 'zh-CN-YunjianNeural'] },
  'hi-IN': { default: 'hi-IN-MadhurNeural', voices: ['hi-IN-MadhurNeural', 'hi-IN-SwaraNeural'] },
  'ru-RU': { default: 'ru-RU-DmitriNeural', voices: ['ru-RU-DmitriNeural', 'ru-RU-SvetlanaNeural'] },
  'nl-NL': { default: 'nl-NL-MaartenNeural', voices: ['nl-NL-MaartenNeural', 'nl-NL-FennaNeural'] },
  'pl-PL': { default: 'pl-PL-MarekNeural', voices: ['pl-PL-MarekNeural', 'pl-PL-AgnieszkaNeural'] },
  'ar-SA': { default: 'ar-SA-HamedNeural', voices: ['ar-SA-HamedNeural', 'ar-SA-ZariyahNeural'] },
  'tr-TR': { default: 'tr-TR-AhmetNeural', voices: ['tr-TR-AhmetNeural', 'tr-TR-EmelNeural'] },
  'sv-SE': { default: 'sv-SE-MattiasNeural', voices: ['sv-SE-MattiasNeural', 'sv-SE-SofieNeural'] },
  'da-DK': { default: 'da-DK-JeppeNeural', voices: ['da-DK-JeppeNeural', 'da-DK-ChristelNeural'] },
  'fi-FI': { default: 'fi-FI-HarriNeural', voices: ['fi-FI-HarriNeural', 'fi-FI-NooraNeural'] },
  'no-NO': { default: 'no-NO-FinnNeural', voices: ['no-NO-FinnNeural', 'no-NO-PernilleNeural'] },
  'uk-UA': { default: 'uk-UA-OstapNeural', voices: ['uk-UA-OstapNeural', 'uk-UA-PolinaNeural'] },
  'vi-VN': { default: 'vi-VN-HoaiMyNeural', voices: ['vi-VN-HoaiMyNeural', 'vi-VN-NamMinhNeural'] },
  'id-ID': { default: 'id-ID-ArdiNeural', voices: ['id-ID-ArdiNeural', 'id-ID-GadisNeural'] },
  'th-TH': { default: 'th-TH-NiwatNeural', voices: ['th-TH-NiwatNeural', 'th-TH-PremwadeeNeural'] },
  'el-GR': { default: 'el-GR-NestorasNeural', voices: ['el-GR-NestorasNeural', 'el-GR-AthinaNeural'] },
  'cs-CZ': { default: 'cs-CZ-AntoninNeural', voices: ['cs-CZ-AntoninNeural', 'cs-CZ-VlastaNeural'] },
  'ro-RO': { default: 'ro-RO-EmilNeural', voices: ['ro-RO-EmilNeural', 'ro-RO-AlinaNeural'] },
  'hu-HU': { default: 'hu-HU-TamasNeural', voices: ['hu-HU-TamasNeural', 'hu-HU-NoemiNeural'] },
};

const SUPPORTED_TTS_LANGS = Object.keys(LANG_VOICES);

const TTS_MODE = process.env.TTS_MODE || 'kokoro';
const MULTIVOZES_URL = (process.env.MULTIVOZES_URL || '').replace(/\/+$/, '');
const MULTIVOZES_KEY = process.env.MULTIVOZES_KEY || '';
const KOKORO_URL = (process.env.KOKORO_URL || '').replace(/\/+$/, '') || 'http://localhost:8000';
const KOKORO_LANG = process.env.KOKORO_LANG || '';
const KOKORO_VOICE = process.env.KOKORO_VOICE || '';

const DEFAULT_VOICE = process.env.TTS_VOICE || 'antonio';
const DEFAULT_RATE = process.env.TTS_RATE || '-5%';
const DEFAULT_PITCH = process.env.TTS_PITCH || '-2Hz';
const DEFAULT_VOLUME = process.env.TTS_VOLUME || '+0%';
const MAX_TTS_LENGTH = 5000;
const MAX_EDGE_TTS_CHUNK = 5000;
const MAX_KOKORO_CHUNK = 200;

function normalizeTextForTTS(text, lang = 'pt-BR') {
  let t = text;

  const isPT = lang === 'pt-BR';
  const isES = lang === 'es-ES';
  const isEN = lang === 'en-US';

  t = t.replace(/R\$\s*(\d)/gi, (m, d) => isPT ? `reais ${d}` : isES ? `reales ${d}` : `reals ${d}`);
  t = t.replace(/US\$\s*(\d)/gi, (m, d) => isPT ? `dólares ${d}` : isES ? `dólares ${d}` : `dollars ${d}`);
  t = t.replace(/€\s*(\d)/g, (m, d) => isPT ? `euros ${d}` : isES ? `euros ${d}` : `euros ${d}`);
  t = t.replace(/£\s*(\d)/g, (m, d) => isPT ? `libras ${d}` : isES ? `libras ${d}` : `pounds ${d}`);
  t = t.replace(/¥\s*(\d)/g, (m, d) => isPT ? `ienes ${d}` : isES ? `yenes ${d}` : `yen ${d}`);
  t = t.replace(/BTC\s*(\d)/gi, (m, d) => `bitcoin ${d}`);
  t = t.replace(/ETH\s*(\d)/gi, (m, d) => `ethereum ${d}`);

  t = t.replace(/\b(\d{1,2})\s*[\/\-]\s*(\d{1,2})\s*[\/\-]\s*(\d{2,4})\b/g, (m, d, mo, y) => {
    const monthsPT = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
    const monthsES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const monthsEN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const monthIdx = parseInt(mo) - 1;
    if (monthIdx < 0 || monthIdx > 11) return m;
    const yr = y.length === 2 ? '20' + y : y;
    if (isES) return `${parseInt(d)} de ${monthsES[monthIdx]} de ${yr}`;
    if (isEN) return `${monthsEN[monthIdx]} ${parseInt(d)}, ${yr}`;
    return `${parseInt(d)} de ${monthsPT[monthIdx]} de ${yr}`;
  });

  t = t.replace(/\b(\d{1,2})\s*:\s*(\d{2})\s*(h|hrs?|horas?)?\b/gi, (m, h, min) => {
    const hour = parseInt(h);
    const minute = parseInt(min);
    if (isPT) return minute === 0 ? `${hour} horas` : `${hour} horas e ${minute}`;
    if (isES) return minute === 0 ? `${hour} horas` : `${hour} horas y ${minute}`;
    return minute === 0 ? `${hour} o'clock` : `${hour}:${minute}`;
  });

  t = t.replace(/\b(\d+)\s*[hH]\b/g, (m, n) => isPT ? `${n} horas` : isES ? `${n} horas` : `${n} hours`);

  t = t.replace(/\b(\d{1,3})(\.\d{3})*,(\d{1,2})\b/g, (m, intPart, decimals) => {
    const num = m.replace(/\./g, '').replace(',', '.');
    const parsed = parseFloat(num);
    return numberToWords(parsed, lang);
  });

  t = t.replace(/\b(\d{1,3})(,\d{3})+\b/g, (m) => {
    return numberToWords(parseInt(m.replace(/,/g, '')), lang);
  });

  t = t.replace(/\b(\d+),(\d{1,2})\b/g, (m, int, dec) => {
    if (dec.length === 2) {
      if (isPT) return `${numberToWords(parseInt(int), lang)} vírgula ${decimalDigits(dec, lang)}`;
      if (isES) return `${numberToWords(parseInt(int), lang)} coma ${decimalDigits(dec, lang)}`;
      return `${numberToWords(parseInt(int), lang)} point ${decimalDigits(dec, lang)}`;
    }
    return m;
  });

  t = t.replace(/(?<!\w)(\d+(?:\.\d+)?)(?!\w*[a-zA-Z])/g, (m) => {
    const num = parseFloat(m);
    if (isNaN(num)) return m;
    if (m.includes('.') && m.split('.')[1].length > 0) {
      const intPart = Math.floor(num);
      const decPart = m.split('.')[1];
      if (isPT) return `${numberToWords(intPart, lang)} ponto ${decimalDigits(decPart, lang)}`;
      if (isES) return `${numberToWords(intPart, lang)} punto ${decimalDigits(decPart, lang)}`;
      return `${numberToWords(intPart, lang)} point ${decimalDigits(decPart, lang)}`;
    }
    return numberToWords(num, lang);
  });

  t = t.replace(/\b(\d+)º\b/g, (m, n) => isPT ? `${n} grau${n !== '1' ? 's' : ''}` : isES ? `${n} grado${n !== '1' ? 's' : ''}` : `${n} degree${n !== '1' ? 's' : ''}`);
  t = t.replace(/\b(\d+)ª\b/g, (m, n) => isPT ? `${numberToWords(parseInt(n), lang)}ª` : isES ? `${numberToWords(parseInt(n), lang)}ª` : `${numberToWords(parseInt(n), lang)}th`);

  t = t.replace(/(\d+)\s*%\s*/g, (m, n) => isPT ? `${numberToWords(parseInt(n), lang)} por cento` : isES ? `${numberToWords(parseInt(n), lang)} por ciento` : `${numberToWords(parseInt(n), lang)} percent`);

  t = t.replace(/#[\dA-Fa-f]{3,8}\b/g, '');

  t = t.replace(/&amp;/gi, isPT ? 'e' : 'and');
  t = t.replace(/&lt;/gi, 'menor que');
  t = t.replace(/&gt;/gi, 'maior que');

  const ABBREVS_PT = {
    'VCÊ': 'você', 'VC': 'você', 'VCS': 'vocês', 'TB': 'também', 'TBM': 'também',
    'PQ': 'porque', 'Q': 'que', 'QD': 'quando', 'QNT': 'quanto', 'QNTO': 'quanto',
    'NRG': 'energia', 'NRGS': 'energias', 'MSG': 'mensagem', 'MSGS': 'mensagens',
    'DTB': 'deus te abençoe', 'PFX': 'pix', 'CPF': 'cé pê éfe', 'CNPJ': 'cê enquê pê jota',
    'RG': 'érgê jê', 'TV': 'teve', 'DVD': 'dê vê dê', 'CD': 'cê dê', 'LED': 'lêd',
    'FAQ': 'perguntas frequentes', 'IA': 'inteligência artificial', 'AI': 'inteligência artificial',
    'CEO': 'cê eô', 'CRM': 'cê erreême', 'URL': 'ur élé', 'API': 'ê pê i',
    'APP': 'aplicativo', 'GPS': 'gê pê ésse', 'VIP': 'você pé',
    'RS': 'rê ésse', 'AV': 'avenida', 'TVS': 'tvs', 'SR': 'senhor', 'SRA': 'senhora',
    'DR': 'doutor', 'DRA': 'doutora', ' prof': ' professor', ' profa': ' professora',
    'etc': 'etcetera', ' vs ': ' versus ', ' vs. ': ' versus ',
    'kg': 'quilos', 'mg': 'miligramas', 'g': 'gramas', 'km': 'quilômetros',
    'm²': 'metros quadrados', 'cm': 'centímetros', 'mm': 'milímetros',
    'lt': 'litros', 'ml': 'mililitros', 'kb': 'quilobytes', 'mb': 'megabytes',
    'gb': 'gigabytes', 'tb': 'terabytes',
  };
  const ABBREVS_EN = {
    'U': 'you', 'UR': 'your', 'R': 'are', 'N': 'and', 'W/': 'with', 'W/O': 'without',
    'B/C': 'because', 'THO': 'though', 'THRU': 'through', 'NITE': 'night',
    'ASAP': 'as soon as possible', 'FYI': 'for your information', 'BTW': 'by the way',
    'IMO': 'in my opinion', 'IMHO': 'in my humble opinion', 'ATM': 'at the moment',
    'CEO': 'C E O', 'CRM': 'C R M', 'API': 'A P I', 'FAQ': 'frequently asked questions',
    'IA': 'artificial intelligence', 'AI': 'artificial intelligence',
    'APP': 'application', 'GPS': 'G P S', 'VIP': 'very important person',
    'RS': 'résumé', 'etc': 'etcetera', ' vs ': ' versus ', ' vs. ': ' versus ',
    'kg': 'kilograms', 'mg': 'milligrams', 'g': 'grams', 'km': 'kilometers',
    'cm': 'centimeters', 'mm': 'millimeters', 'lb': 'pounds', 'oz': 'ounces',
    'ft': 'feet', 'in': 'inches', 'mph': 'miles per hour',
    'kb': 'kilobytes', 'mb': 'megabytes', 'gb': 'gigabytes', 'tb': 'terabytes',
  };
  const ABBREVS_ES = {
    'UD': 'usted', 'MÑO': 'año', 'TB': 'también', 'PQ': 'porque',
    'Q': 'que', 'QD': 'cuándo', 'FAQ': 'preguntas frecuentes',
    'IA': 'inteligencia artificial', 'AI': 'inteligencia artificial',
    'CEO': 'cé eo', 'CRM': 'cé erre eme', 'API': 'a pe i',
    'APP': 'aplicación', 'GPS': 'gé pe ese', 'VIP': 'vé í pé',
    'etc': 'etcétera', ' vs ': ' versus ', ' vs. ': ' versus ',
    'kg': 'kilos', 'mg': 'miligramos', 'g': 'gramos', 'km': 'kilómetros',
    'cm': 'centímetros', 'mm': 'milímetros', 'lt': 'litros', 'ml': 'mililitros',
    'kb': 'kilobytes', 'mb': 'megabytes', 'gb': 'gigabytes', 'tb': 'terabytes',
  };

  const abbrevs = isEN ? ABBREVS_EN : isES ? ABBREVS_ES : ABBREVS_PT;
  for (const [abbr, expansion] of Object.entries(abbrevs)) {
    const re = new RegExp(`\\b${abbr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    t = t.replace(re, expansion);
  }

  t = t.replace(/[\u00B0\u00BA\u00AA]/g, '');

  t = t.replace(/\s*(\.{3,}|…)\s*/g, isPT ? ' ... ' : isES ? ' ... ' : ' ... ');

  t = t.replace(/\s*—\s*/g, ' — ');
  t = t.replace(/\s*–\s*/g, ' — ');

  t = t.replace(/([.!?])\s*\.{2,}/g, '$1');
  t = t.replace(/\.{2,}/g, '.');

  t = t.replace(/[;]/g, isPT ? '.' : isES ? '.' : '.');

  t = t.replace(/\s*=\s*/g, isPT ? ' igual a ' : isES ? ' igual a ' : ' equals ');

  t = t.replace(/(?<=[a-zA-Z])\s*\/\s*(?=[a-zA-Z])/g, isPT ? ' ou ' : isES ? ' o ' : ' or ');

  t = t.replace(/[()]/g, ' ');

  t = t.replace(/[{}[\]<>]/g, '');

  t = t.replace(/[@#\$]/g, (m) => {
    if (m === '@') return isPT ? 'arroba' : isES ? 'arroba' : 'at';
    if (m === '#') return '';
    if (m === '$') return isPT ? 'dólares' : isES ? 'dólares' : 'dollars';
    return '';
  });

  t = t.replace(/\*\*/g, '');
  t = t.replace(/\*/g, '');
  t = t.replace(/_{2,}/g, '');
  t = t.replace(/_/g, ' ');

  t = t.replace(/\s{2,}/g, ' ');

  return t.trim();
}

function numberToWords(n, lang = 'pt-BR') {
  if (n === 0) return isLang(lang, 'zero', 'cero', 'zero');
  if (n < 0) return isLang(lang, 'menos', 'menos', 'minus') + ' ' + numberToWords(Math.abs(n), lang);

  const intPart = Math.floor(n);
  const words = integerToWords(intPart, lang);
  return words;
}

function decimalDigits(digits, lang) {
  const isPT = lang === 'pt-BR';
  const isES = lang === 'es-ES';
  return digits.split('').map(d => {
    if (isPT) return ['zero','um','dois','três','quatro','cinco','seis','sete','oito','nove'][parseInt(d)];
    if (isES) return ['cero','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve'][parseInt(d)];
    return ['zero','one','two','three','four','five','six','seven','eight','nine'][parseInt(d)];
  }).join(' ');
}

function isLang(lang, pt, es, en) {
  if (lang === 'pt-BR') return pt;
  if (lang === 'es-ES') return es;
  return en;
}

function integerToWords(n, lang = 'pt-BR') {
  if (n === 0) return '';
  if (n < 0) return '';

  const ONES_PT = ['','um','dois','três','quatro','cinco','seis','sete','oito','nove'];
  const TEENS_PT = ['dez','onze','doze','treze','quatorze','quinze','dezesseis','dezessete','dezoito','dezenove'];
  const TENS_PT = ['','','vinte','trinta','quarenta','cinquenta','sessenta','setenta','oitenta','noventa'];
  const HUNDREDS_PT = ['','cento','duzentos','trezentos','quatrocentos','quinhentos','seiscentos','setecentos','oitocentos','novecentos'];

  const ONES_EN = ['','one','two','three','four','five','six','seven','eight','nine'];
  const TEENS_EN = ['ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
  const TENS_EN = ['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
  const HUNDREDS_EN = ['','one hundred','two hundred','three hundred','four hundred','five hundred','six hundred','seven hundred','eight hundred','nine hundred'];

  const ONES_ES = ['','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve'];
  const TEENS_ES = ['diez','once','doce','trece','catorce','quince','dieciséis','diecisiete','dieciocho','diecinueve'];
  const TENS_ES = ['','','veinte','treinta','cuarenta','cincuenta','sesenta','setenta','ochenta','noventa'];
  const HUNDREDS_ES = ['','ciento','doscientos','trescientos','cuatrocientos','quinientos','seiscientos','setecientos','ochocientos','novecientos'];

  const isPT = lang === 'pt-BR';
  const isES = lang === 'es-ES';
  const isEN = lang === 'en-US';

  const ones = isPT ? ONES_PT : isES ? ONES_ES : ONES_EN;
  const teens = isPT ? TEENS_PT : isES ? TEENS_ES : TEENS_EN;
  const tens = isPT ? TENS_PT : isES ? TENS_ES : TENS_EN;
  const hundreds = isPT ? HUNDREDS_PT : isES ? HUNDREDS_ES : HUNDREDS_EN;

  let words = '';

  if (n >= 1000000) {
    const millions = Math.floor(n / 1000000);
    const rest = n % 1000000;
    if (isPT) words += `${millions > 1 ? integerToWords(millions, lang) : ''} milh${millions === 1 ? 'ão' : 'ões'}`;
    else if (isES) words += `${integerToWords(millions, lang)} mill${millions === 1 ? 'ón' : 'ones'}`;
    else words += `${integerToWords(millions, lang)} million${millions > 1 ? 's' : ''}`;
    if (rest > 0) words += ' ' + integerToWords(rest, lang);
    return words;
  }

  if (n >= 1000) {
    const thousands = Math.floor(n / 1000);
    const rest = n % 1000;
    if (isPT) words += (thousands === 1 ? 'mil' : integerToWords(thousands, lang) + ' mil');
    else if (isES) words += (thousands === 1 ? 'mil' : integerToWords(thousands, lang) + ' mil');
    else words += integerToWords(thousands, lang) + ' thousand';
    if (rest > 0) words += ' ' + integerToWords(rest, lang);
    return words;
  }

  if (n >= 100) {
    const h = Math.floor(n / 100);
    const rest = n % 100;
    if (isPT && n === 100) return 'cem';
    if (isES && n === 100) return 'cien';
    if (isEN && n === 100) return 'one hundred';
    words += hundreds[h];
    if (rest > 0) {
      if (isPT) words += ' e ' + integerToWords(rest, lang);
      else if (isES) words += ' ' + integerToWords(rest, lang);
      else words += ' ' + integerToWords(rest, lang);
    }
    return words;
  }

  if (n >= 20) {
    const d = Math.floor(n / 10);
    const u = n % 10;
    if (isPT && n >= 16 && n <= 19) return teens[n - 10];
    if (u === 0) return tens[d];
    if (isPT) return tens[d] + ' e ' + ones[u];
    if (isES) return tens[d] + ' y ' + ones[u];
    return tens[d] + '-' + ones[u];
  }

  if (n >= 10) return teens[n - 10];
  if (n >= 1) return ones[n];
  return '';
}

function cleanTextForTTS(text, lang = 'pt-BR') {
  let cleaned = text
    .replace(/[\ud800-\udbff][\udc00-\udfff]/g, '');
  cleaned = cleaned.replace(/[\ud800-\udfff]/g, '');
  cleaned = normalizeTextForTTS(cleaned, lang);
  return cleaned
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    .replace(/\*{2}([^*]+)\*{2}/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/~~[^~]+~~/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/#{1,6}\s/g, '')
    .replace(/^[>\-]\s?/gm, '')
    .replace(/---+/g, '—')
    .replace(/[📖🕊🙏🔍💡✝🎤🎵🎶✨🔥❤️💛💚💙💜🤍🖤💔🙏🏻🙏🏼🙏🏽🙏🏾🙏🏿]/g, '')
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
    .replace(/[\u2700-\u27BF\u2600-\u26FF\u2300-\u23FF\u2B50\uFE0F\u200D]/g, '')
    .replace(/(\d+):(\d+)/g, (_, ch, vs) => `${ch}, versículo ${vs}`)
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n/g, '. ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\.{2,}/g, '...')
    .replace(/\s+\./g, '.')
    .replace(/^[-•]\s+/gm, '')
    .replace(/,\s*,/g, ',')
    .replace(/\.\s*\.\s*\./g, '...')
    .replace(/!\./g, '!')
    .replace(/\?\./g, '?')
    .replace(/—\s+/g, '— ')
    .replace(/\s+$/gm, '')
    .replace(/(\w[.!?])\s{2,}/g, '$1 ')
    .trim();
}

function splitTextForTTS(text, maxLen = 450, lang = 'pt-BR') {
  const clean = cleanTextForTTS(text, lang);
  if (!clean) return [];
  if (clean.length <= maxLen) return [clean];

  const sentences = clean.match(/[^.!?]+[.!?]+/g) || [clean];
  const chunks = [];
  let current = '';

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;

    if ((current + ' ' + trimmed).trim().length > maxLen && current.length > 0) {
      chunks.push(current.trim());
      current = trimmed;
    } else {
      current = current ? current + ' ' + trimmed : trimmed;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  return chunks.length > 0 ? chunks : [clean.substring(0, maxLen)];
}

function prepareTextForKokoro(text) {
  return text;
}

function generateTTSAudioUrl(text, lang = 'pt-BR') {
  const encoded = encodeURIComponent(text);
  const ttsLang = lang === 'en-US' ? 'en' : lang === 'es-ES' ? 'es' : 'pt-BR';
  return `https://translate.google.com/translate_tts?ie=UTF-8&q=${encoded}&tl=${ttsLang}&client=tw-ob`;
}

async function generateEdgeTTSBuffer(text, options = {}) {
  const langConfig = LANG_VOICES[options.lang] || LANG_VOICES['pt-BR'];
  let voice = null;
  if (options.kokoroVoice && KOKORO_EDGE_VOICE_MAP[options.kokoroVoice]) {
    voice = KOKORO_EDGE_VOICE_MAP[options.kokoroVoice];
  } else if (options.voice) {
    voice = VOICES[options.voice] || options.voice;
  }
  if (!voice) {
    if (options.lang && LANG_VOICES[options.lang]) {
      voice = LANG_VOICES[options.lang].default;
    } else {
      voice = VOICES[DEFAULT_VOICE] || VOICES.antonio;
    }
  }
  const rate = options.rate || DEFAULT_RATE;
  const pitch = options.pitch || DEFAULT_PITCH;
  const volume = options.volume || DEFAULT_VOLUME;

  const tmpDir = os.tmpdir();
  const tmpFile = path.join(tmpDir, `tts_${crypto.randomUUID()}.mp3`);

  try {
    const args = [
      '--voice', voice,
      '--rate=' + rate,
      '--pitch=' + pitch,
      '--volume=' + volume,
      '--write-media', tmpFile,
      '--text', text,
    ];

    const { stderr } = await execFileAsync('edge-tts', args, {
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
    });

    const buffer = fs.readFileSync(tmpFile);
    if (buffer.length === 0) {
      throw new Error('Edge TTS generated empty audio');
    }

    return buffer;
  } finally {
    try {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
      const mp3Files = fs.readdirSync(tmpDir).filter(f => f.startsWith('tts_') && f.endsWith('.mp3'));
      const now = Date.now();
      for (const f of mp3Files) {
        try {
          const stat = fs.statSync(path.join(tmpDir, f));
          if (now - stat.mtimeMs > 60000) fs.unlinkSync(path.join(tmpDir, f));
        } catch {}
      }
    } catch {}
  }
}

async function generateMultivozesBuffer(text, options = {}) {
  if (!MULTIVOZES_URL || !MULTIVOZES_KEY) {
    throw new Error('MULTIVOZES_URL or MULTIVOZES_KEY not configured');
  }

  const langConfig = LANG_VOICES[options.lang] || LANG_VOICES['pt-BR'];
  let voice = options.voice ? (VOICES[options.voice] || options.voice) : null;
  if (!voice) voice = langConfig.default;

  const openaiVoice = Object.entries(MULTIVOZES_VOICE_MAP).find(([, v]) => v === voice);
  const voiceName = openaiVoice ? openaiVoice[0] : 'alloy';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  let response;
  try {
    response = await fetch(`${MULTIVOZES_URL}/v1/audio/speech`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(MULTIVOZES_KEY ? { Authorization: `Bearer ${MULTIVOZES_KEY}` } : {}),
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'tts-1',
        voice: voiceName,
        input: text,
        response_format: 'mp3',
        speed: 1.0,
      }),
    });
  } catch (err) {
    throw new Error(`Multivozes fetch failed or timed out: ${err.message}`);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Multivozes API ${response.status}: ${errText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function generateKokoroBuffer(text, options = {}) {
  if (!KOKORO_URL) {
    throw new Error('KOKORO_URL not configured');
  }

  const lang = options.lang || 'pt-BR';
  const langConfig = KOKORO_VOICES[lang] || KOKORO_VOICES['pt-BR'];
  const voice = KOKORO_VOICE || options.kokoroVoice || langConfig.voice;
  const langCode = KOKORO_LANG || langConfig.lang_code;

  const openaiVoice = options.voice ? (KOKORO_VOICE_MAP[options.voice] || options.voice) : null;
  const finalVoice = openaiVoice || voice;
  const speed = options.speed || 1.0;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);
  let response;
  try {
    response = await fetch(`${KOKORO_URL}/v1/audio/speech`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Connection': 'keep-alive',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'kokoro',
        voice: finalVoice,
        input: text,
        lang,
        language: langCode,
        response_format: 'wav',
        speed,
      }),
    });
  } catch (err) {
    throw new Error(`Kokoro fetch failed or timed out: ${err.message}`);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Kokoro TTS API ${response.status}: ${errText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function mergeWavBuffers(buffers) {
  if (!buffers || buffers.length === 0) return null;
  if (buffers.length === 1) return buffers[0];

  const firstBuf = buffers[0];
  if (firstBuf.length < 44 || firstBuf.toString('ascii', 0, 4) !== 'RIFF' || firstBuf.toString('ascii', 8, 12) !== 'WAVE') {
    return Buffer.concat(buffers);
  }

  // Find the 'data' chunk in the first buffer
  let dataOffset = -1;
  for (let i = 12; i < firstBuf.length - 8; i++) {
    if (firstBuf.toString('ascii', i, i + 4) === 'data') {
      dataOffset = i;
      break;
    }
  }

  if (dataOffset === -1) {
    dataOffset = 44;
  } else {
    dataOffset += 8; // Skip 'data' (4 bytes) and ChunkSize (4 bytes)
  }

  // Calculate total PCM data size
  let totalPCMSize = firstBuf.length - dataOffset;
  
  // For subsequent buffers, search for the 'data' chunk offset
  const subsequentOffsets = [];
  for (let i = 1; i < buffers.length; i++) {
    const buf = buffers[i];
    let offset = -1;
    for (let j = 12; j < buf.length - 8; j++) {
      if (buf.toString('ascii', j, j + 4) === 'data') {
        offset = j;
        break;
      }
    }
    if (offset === -1) {
      offset = 44;
    } else {
      offset += 8;
    }
    subsequentOffsets.push(offset);
    if (buf.length > offset) {
      totalPCMSize += (buf.length - offset);
    }
  }

  // Create merged buffer
  const merged = Buffer.alloc(dataOffset + totalPCMSize);

  // Copy header from first buffer
  firstBuf.copy(merged, 0, 0, dataOffset);

  // Copy PCM data from first buffer
  let writeOffset = dataOffset;
  firstBuf.copy(merged, writeOffset, dataOffset);
  writeOffset += (firstBuf.length - dataOffset);

  // Copy PCM data from subsequent buffers
  for (let i = 1; i < buffers.length; i++) {
    const buf = buffers[i];
    const readOffset = subsequentOffsets[i - 1];
    if (buf.length > readOffset) {
      buf.copy(merged, writeOffset, readOffset);
      writeOffset += (buf.length - readOffset);
    }
  }

  // Update total file size (bytes 4-7): total size - 8 bytes
  merged.writeUInt32LE(dataOffset + totalPCMSize - 8, 4);

  // Update data subchunk size (bytes dataOffset-4 to dataOffset-1): totalPCMSize
  merged.writeUInt32LE(totalPCMSize, dataOffset - 4);

  return merged;
}

async function generateAudioBuffer(text, options = {}) {
  const lang = options.lang || 'pt-BR';
  const ttsLang = SUPPORTED_TTS_LANGS.includes(lang) ? lang : 'pt-BR';
  const cleanText = cleanTextForTTS(text, ttsLang);

  let engine = 'edge-tts';
  let contentType = 'audio/mp3';

  if (TTS_MODE === 'kokoro' && KOKORO_URL) {
    engine = 'kokoro';
    contentType = 'audio/wav';
  } else if (TTS_MODE === 'multivozes' && MULTIVOZES_URL && MULTIVOZES_KEY) {
    engine = 'multivozes';
    contentType = 'audio/mp3';
  }

  const maxChunk = engine === 'kokoro' ? MAX_KOKORO_CHUNK : MAX_EDGE_TTS_CHUNK;

  if (cleanText.length <= maxChunk) {
    try {
      const buf = await generateWithEngine(engine, cleanText, { ...options, lang: ttsLang });
      if (buf && buf.length > 0) {
        buf.contentType = contentType;
        return buf;
      }
    } catch {}

    if (engine !== 'edge-tts') {
      try {
        const buf = await generateEdgeTTSBuffer(cleanText, { ...options, lang: ttsLang });
        if (buf && buf.length > 0) {
          buf.contentType = 'audio/mp3';
          return buf;
        }
      } catch {}
    }
    return null;
  }

  const chunks = splitTextForTTS(text, maxChunk);
  if (chunks.length === 0) return null;

  const buffers = [];
  let fellBack = false;
  let fallbackEngine = null;

  for (const chunk of chunks) {
    if (!fellBack) {
      try {
        const buf = await generateWithEngine(engine, chunk, { ...options, lang: ttsLang });
        if (buf && buf.length > 0) {
          buf.contentType = contentType;
          buffers.push(buf);
          continue;
        }
      } catch {}
    }

    if (!fellBack) {
      fellBack = true;
      fallbackEngine = 'edge';
      console.warn(`[TTS] Primary engine failed, falling back to Edge TTS for remaining chunks`);
    }

    try {
      const buf = await generateEdgeTTSBuffer(chunk, { ...options, lang: ttsLang });
      if (buf && buf.length > 0) {
        buf.contentType = 'audio/mp3';
        buffers.push(buf);
      }
    } catch {}
  }

  if (buffers.length === 0) return null;

  if (buffers.length === 1) {
    buffers[0].contentType = fellBack ? 'audio/mp3' : contentType;
    return buffers[0];
  }

  const mixedFormats = buffers.some(b => b.contentType === 'audio/wav') && buffers.some(b => b.contentType === 'audio/mp3');
  if (mixedFormats) {
    console.warn('[TTS] Mixed audio formats detected, regenerating all chunks with Edge TTS for consistency');
    const fallbackBuffers = [];
    for (const chunk of chunks) {
      try {
        const buf = await generateEdgeTTSBuffer(chunk, { ...options, lang: ttsLang });
        if (buf && buf.length > 0) {
          buf.contentType = 'audio/mp3';
          fallbackBuffers.push(buf);
        }
      } catch {}
    }
    if (fallbackBuffers.length === 0) return null;
    if (fallbackBuffers.length === 1) {
      fallbackBuffers[0].contentType = 'audio/mp3';
      return fallbackBuffers[0];
    }
    const result = Buffer.concat(fallbackBuffers);
    result.contentType = 'audio/mp3';
    return result;
  }

  const finalContentType = fellBack ? 'audio/mp3' : contentType;
  let result;
  if (finalContentType === 'audio/wav') {
    try {
      const { concatAudio } = require('../media/ffmpeg');
      const concatenated = await concatAudio(buffers, 'wav', 'wav');
      if (concatenated && concatenated.length > 0) {
        result = concatenated;
      } else {
        result = mergeWavBuffers(buffers);
      }
    } catch {
      result = mergeWavBuffers(buffers);
    }
  } else {
    try {
      const { concatAudio } = require('../media/ffmpeg');
      const concatenated = await concatAudio(buffers, 'mp3', 'mp3');
      if (concatenated && concatenated.length > 0) {
        result = concatenated;
      } else {
        result = Buffer.concat(buffers);
      }
    } catch {
      result = Buffer.concat(buffers);
    }
  }
  result.contentType = finalContentType;
  return result;
}

function getAudioContentType(buffer) {
  if (buffer && buffer.contentType) return buffer.contentType;
  if (TTS_MODE === 'kokoro') return 'audio/wav';
  return 'audio/mp3';
}

function getAvailableVoices(lang = null) {
  const voices = {};
  for (const [langCode, config] of Object.entries(LANG_VOICES)) {
    if (lang && langCode !== lang) continue;
    voices[langCode] = {
      default: config.default,
      voices: config.voices,
      kokoro: KOKORO_VOICES[langCode] ? KOKORO_VOICES[langCode].voice : null,
    };
  }
  return voices;
}

function getVoiceForLang(lang = 'pt-BR', voiceName = null) {
  const langConfig = LANG_VOICES[lang] || LANG_VOICES['pt-BR'];
  if (voiceName) {
    const directMatch = langConfig.voices.find(v => v.toLowerCase().includes(voiceName.toLowerCase()));
    if (directMatch) return directMatch;
    const kokoroMatch = KOKORO_VOICE_MAP[voiceName];
    if (kokoroMatch) {
      const edgeMatch = KOKORO_EDGE_VOICE_MAP[kokoroMatch];
      if (edgeMatch) return edgeMatch;
      return kokoroMatch;
    }
  }
  return langConfig.default;
}

async function generateWithEngine(engine, text, options = {}) {
  switch (engine) {
    case 'kokoro':
      return await generateKokoroBuffer(text, options);
    case 'multivozes':
      return await generateMultivozesBuffer(text, options);
    default:
      return await generateEdgeTTSBuffer(text, options);
  }
}

function generateAudioDataUrl(buffer) {
  const base64 = buffer.toString('base64');
  return `data:audio/mp3;base64,${base64}`;
}

module.exports = {
  cleanTextForTTS,
  splitTextForTTS,
  prepareTextForKokoro,
  generateTTSAudioUrl,
  generateEdgeTTSBuffer,
  generateAudioBuffer,
  generateAudioDataUrl,
  getAudioContentType,
  getAvailableVoices,
  getVoiceForLang,
  VOICES,
  KOKORO_VOICES,
  KOKORO_VOICE_MAP,
  KOKORO_EDGE_VOICE_MAP,
  LANG_VOICES,
  SUPPORTED_TTS_LANGS,
  DEFAULT_VOICE,
  DEFAULT_RATE,
  DEFAULT_PITCH,
  DEFAULT_VOLUME,
  MAX_TTS_LENGTH,
};