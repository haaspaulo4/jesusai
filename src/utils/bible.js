require('dotenv').config();
const fs = require('fs');
const path = require('path');

const BIBLE_DATA_PATH = path.join(__dirname, '..', '..', 'data', 'bible-api', 'bibles', 'pt-BR-blt', 'books');
const BIBLE_API_BASE = 'https://bible-api.com';

const BOOKS_LOCAL = {};
const OLD_TESTAMENT_SLUGS = {
  'genesis': 'genesis', 'exodo': 'exodus', 'levitico': 'leviticus',
  'numeros': 'numbers', 'deuteronomio': 'deuteronomy',
  'josue': 'joshua', 'juizes': 'judges', 'rute': 'ruth',
  '1samuel': '1samuel', '2samuel': '2samuel',
  '1reis': '1kings', '2reis': '2kings',
  '1cronicas': '1chronicles', '2cronicas': '2chronicles',
  'esdras': 'ezra', 'neemias': 'nehemiah', 'ester': 'esther',
  'jo': 'job', 'salmos': 'psalms', 'proverbios': 'proverbs',
  'eclesiastes': 'ecclesiastes', 'cantares': 'songofsolomon',
  'isaias': 'isaiah', 'jeremias': 'jeremiah', 'lamentacoes': 'lamentations',
  'ezequiel': 'ezekiel', 'daniel': 'daniel',
  'oseias': 'hosea', 'joel': 'joel', 'amos': 'amos',
  'obadias': 'obadiah', 'jonas': 'jonah', 'miqueias': 'micah',
  'naum': 'nahum', 'habacuque': 'habakkuk', 'sofonias': 'zephaniah',
  'ageu': 'haggai', 'zacarias': 'zechariah', 'malaquias': 'malachi',
};

const NEW_TESTAMENT_SLUGS = {
  'mateus': 'matthew', 'marcos': 'mark', 'lucas': 'luke', 'joao': 'john',
  'atos': 'acts', 'romanos': 'romans',
  '1corintios': '1corinthians', '2corintios': '2corinthians',
  'galatas': 'galatians', 'efesios': 'ephesians', 'filipenses': 'philippians',
  'colossenses': 'colossians',
  '1tessalonicenses': '1thessalonians', '2tessalonicenses': '2thessalonians',
  '1timoteo': '1timothy', '2timoteo': '2timothy', 'tito': 'titus',
  'filemom': 'philemon', 'hebreus': 'hebrews', 'tiago': 'james',
  '1pedro': '1peter', '2pedro': '2peter',
  '1joao': '1john', '2joao': '2john', '3joao': '3john',
  'judas': 'jude', 'apocalipse': 'revelation',
};

const BIBLE_API_BOOK_NAMES = {
  genesis: 'Genesis', exodus: 'Exodus', leviticus: 'Leviticus',
  numbers: 'Numbers', deuteronomy: 'Deuteronomy',
  joshua: 'Joshua', judges: 'Judges', ruth: 'Ruth',
  '1samuel': '1Samuel', '2samuel': '2Samuel',
  '1kings': '1Kings', '2kings': '2Kings',
  '1chronicles': '1Chronicles', '2chronicles': '2Chronicles',
  ezra: 'Ezra', nehemiah: 'Nehemiah', esther: 'Esther',
  job: 'Job', psalms: 'Psalms', proverbs: 'Proverbs',
  ecclesiastes: 'Ecclesiastes', songofsolomon: 'SongOfSolomon',
  isaiah: 'Isaiah', jeremiah: 'Jeremiah', lamentations: 'Lamentations',
  ezekiel: 'Ezekiel', daniel: 'Daniel',
  hosea: 'Hosea', joel: 'Joel', amos: 'Amos',
  obadiah: 'Obadiah', jonah: 'Jonah', micah: 'Micah',
  nahum: 'Nahum', habakkuk: 'Habakkuk', zephaniah: 'Zephaniah',
  haggai: 'Haggai', zechariah: 'Zechariah', malachi: 'Malachi',
  matthew: 'Matthew', mark: 'Mark', luke: 'Luke', john: 'John',
  acts: 'Acts', romans: 'Romans',
  '1corinthians': '1Corinthians', '2corinthians': '2Corinthians',
  galatians: 'Galatians', ephesians: 'Ephesians', philippians: 'Philippians',
  colossians: 'Colossians',
  '1thessalonians': '1Thessalonians', '2thessalonians': '2Thessalonians',
  '1timothy': '1Timothy', '2timothy': '2Timothy', titus: 'Titus',
  philemon: 'Philemon', hebrews: 'Hebrews', james: 'James',
  '1peter': '1Peter', '2peter': '2Peter',
  '1john': '1John', '2john': '2John', '3john': '3John',
  jude: 'Jude', revelation: 'Revelation',
};

const axios = require('axios');

function discoverLocalBooks() {
  const books = {};
  if (!fs.existsSync(BIBLE_DATA_PATH)) return books;

  const entries = fs.readdirSync(BIBLE_DATA_PATH);
  for (const entry of entries) {
    const bookPath = path.join(BIBLE_DATA_PATH, entry);
    if (!fs.statSync(bookPath).isDirectory()) continue;

    const chaptersPath = path.join(bookPath, 'chapters');
    if (!fs.existsSync(chaptersPath)) continue;

    const chapters = fs.readdirSync(chaptersPath).filter((d) => {
      return fs.statSync(path.join(chaptersPath, d)).isDirectory();
    }).map(Number).filter((n) => !isNaN(n)).sort((a, b) => a - b);

    if (chapters.length > 0) {
      books[entry] = { localName: entry, chapters };
    }
  }
  return books;
}

function readLocalVerse(bookName, chapter, verse) {
  const bookDir = path.join(BIBLE_DATA_PATH, bookName);
  const versePath = path.join(bookDir, 'chapters', String(chapter), 'verses', `${verse}.json`);

  if (!fs.existsSync(versePath)) return null;

  try {
    const data = JSON.parse(fs.readFileSync(versePath, 'utf-8'));
    return {
      book: bookName,
      chapter: data.chapter || chapter,
      verse: data.verse || verse,
      text: data.text || '',
      reference: `${bookName} ${data.chapter || chapter}:${data.verse || verse}`,
    };
  } catch {
    return null;
  }
}

async function fetchVerseFromAPI(bookSlug, chapter, verse) {
  const apiBook = BIBLE_API_BOOK_NAMES[bookSlug];
  if (!apiBook) return null;

  try {
    const url = `${BIBLE_API_BASE}/${apiBook}+${chapter}:${verse}?translation=almeida`;
    const res = await axios.get(url, { timeout: 10000 });
    const data = res.data;

    if (data.verses && data.verses.length > 0) {
      const v = data.verses[0];
      return {
        book: v.book_name || apiBook,
        chapter: v.chapter,
        verse: v.verse,
        text: v.text.trim(),
        reference: `${v.book_name || apiBook} ${v.chapter}:${v.verse}`,
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchChapterFromAPI(bookSlug, chapter) {
  const apiBook = BIBLE_API_BOOK_NAMES[bookSlug];
  if (!apiBook) return [];

  try {
    const url = `${BIBLE_API_BASE}/${apiBook}+${chapter}?translation=almeida`;
    const res = await axios.get(url, { timeout: 15000 });
    const data = res.data;

    if (data.verses && Array.isArray(data.verses)) {
      return data.verses.map((v) => ({
        book: v.book_name || apiBook,
        chapter: v.chapter,
        verse: v.verse,
        text: v.text.trim(),
        reference: `${v.book_name || apiBook} ${v.chapter}:${v.verse}`,
      })).filter((v) => v.text.length > 0);
    }
    return [];
  } catch {
    return [];
  }
}

function readLocalChapter(bookName, chapter) {
  const chapterDir = path.join(BIBLE_DATA_PATH, bookName, 'chapters', String(chapter), 'verses');
  if (!fs.existsSync(chapterDir)) return [];

  const verses = [];
  const files = fs.readdirSync(chapterDir).filter((f) => f.endsWith('.json')).sort((a, b) => {
    return Number(a.replace('.json', '')) - Number(b.replace('.json', ''));
  });

  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(chapterDir, file), 'utf-8'));
      if (data.text && data.text.trim()) {
        verses.push({
          book: bookName,
          chapter: data.chapter || chapter,
          verse: data.verse || Number(file.replace('.json', '')),
          text: data.text.trim(),
          reference: `${bookName} ${data.chapter || chapter}:${data.verse || file.replace('.json', '')}`,
        });
      }
    } catch {}
  }
  return verses;
}

module.exports = {
  discoverLocalBooks,
  readLocalVerse,
  readLocalChapter,
  fetchVerseFromAPI,
  fetchChapterFromAPI,
  BIBLE_API_BOOK_NAMES,
  BIBLE_API_BASE,
  OLD_TESTAMENT_SLUGS,
  NEW_TESTAMENT_SLUGS,
  BIBLE_DATA_PATH,
};