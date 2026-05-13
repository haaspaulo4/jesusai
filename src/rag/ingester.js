require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { discoverLocalBooks, readLocalChapter } = require('../utils/bible');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const VERSES_PATH = path.join(DATA_DIR, 'bible_verses.json');

const OT_BOOKS = [
  { slug: 'Genesis', chapters: 50, pt: 'Gênesis' },
  { slug: 'Exodus', chapters: 40, pt: 'Êxodo' },
  { slug: 'Leviticus', chapters: 27, pt: 'Levítico' },
  { slug: 'Numbers', chapters: 36, pt: 'Números' },
  { slug: 'Deuteronomy', chapters: 34, pt: 'Deuteronômio' },
  { slug: 'Joshua', chapters: 24, pt: 'Josué' },
  { slug: 'Judges', chapters: 21, pt: 'Juízes' },
  { slug: 'Ruth', chapters: 4, pt: 'Rute' },
  { slug: '1 Samuel', chapters: 31, pt: '1 Samuel' },
  { slug: '2 Samuel', chapters: 24, pt: '2 Samuel' },
  { slug: '1 Kings', chapters: 22, pt: '1 Reis' },
  { slug: '2 Kings', chapters: 25, pt: '2 Reis' },
  { slug: '1 Chronicles', chapters: 29, pt: '1 Crônicas' },
  { slug: '2 Chronicles', chapters: 36, pt: '2 Crônicas' },
  { slug: 'Ezra', chapters: 10, pt: 'Esdras' },
  { slug: 'Nehemiah', chapters: 13, pt: 'Neemias' },
  { slug: 'Esther', chapters: 10, pt: 'Ester' },
  { slug: 'Job', chapters: 42, pt: 'Jó' },
  { slug: 'Psalms', chapters: 150, pt: 'Salmos' },
  { slug: 'Proverbs', chapters: 31, pt: 'Provérbios' },
  { slug: 'Ecclesiastes', chapters: 12, pt: 'Eclesiastes' },
  { slug: 'Song of Solomon', chapters: 8, pt: 'Cantares' },
  { slug: 'Isaiah', chapters: 66, pt: 'Isaías' },
  { slug: 'Jeremiah', chapters: 52, pt: 'Jeremias' },
  { slug: 'Lamentations', chapters: 5, pt: 'Lamentações' },
  { slug: 'Ezekiel', chapters: 48, pt: 'Ezequiel' },
  { slug: 'Daniel', chapters: 12, pt: 'Daniel' },
  { slug: 'Hosea', chapters: 14, pt: 'Oseias' },
  { slug: 'Joel', chapters: 3, pt: 'Joel' },
  { slug: 'Amos', chapters: 9, pt: 'Amós' },
  { slug: 'Obadiah', chapters: 1, pt: 'Obadias' },
  { slug: 'Jonah', chapters: 4, pt: 'Jonas' },
  { slug: 'Micah', chapters: 7, pt: 'Miquéias' },
  { slug: 'Nahum', chapters: 3, pt: 'Naum' },
  { slug: 'Habakkuk', chapters: 3, pt: 'Habacuque' },
  { slug: 'Zephaniah', chapters: 3, pt: 'Sofonias' },
  { slug: 'Haggai', chapters: 2, pt: 'Ageu' },
  { slug: 'Zechariah', chapters: 14, pt: 'Zacarias' },
  { slug: 'Malachi', chapters: 4, pt: 'Malaquias' },
];

const BIBLE_API_BASE = process.env.BIBLE_API_BASE || 'https://bible-api.com';
const BIBLE_VERSION = process.env.BIBLE_VERSION || 'almeida';
const DELAY_MS = 2000;

async function fetchChapter(bookSlug, chapter) {
  const url = `${BIBLE_API_BASE}/${encodeURIComponent(bookSlug)}+${chapter}?translation=${BIBLE_VERSION}`;

  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });

      if (res.status === 429) {
        const wait = DELAY_MS * attempt * 3;
        console.log(`    Rate limited, waiting ${wait}ms (attempt ${attempt})...`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }

      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      if (data.verses && Array.isArray(data.verses)) {
        return data.verses.map(v => ({
          book: v.book_name || bookSlug,
          chapter: v.chapter,
          verse: v.verse,
          text: (v.text || '').trim(),
          reference: `${v.book_name || bookSlug} ${v.chapter}:${v.verse}`,
        })).filter(v => v.text.length > 0);
      }
      return null;
    } catch (err) {
      if (attempt === 5) {
        console.log(`    Failed after 5 attempts: ${err.message}`);
        return null;
      }
      await new Promise(r => setTimeout(r, DELAY_MS * attempt));
    }
  }
  return null;
}

async function ingestBible() {
  console.log('Starting Bible ingestion...\n');

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  let existing = [];
  const existingSet = new Set();

  if (fs.existsSync(VERSES_PATH)) {
    try {
      existing = JSON.parse(fs.readFileSync(VERSES_PATH, 'utf-8'));
      for (const v of existing) {
        if (v.reference) existingSet.add(v.reference);
      }
      console.log(`Existing: ${existing.length} verses, ${existingSet.size} unique references`);
    } catch {
      existing = [];
    }
  }

  if (existing.length >= 30000) {
    console.log(`Already have ${existing.length} verses. Checking for gaps...`);
  }

  let allVerses = [...existing];

  // === New Testament from local files ===
  console.log('\n=== Ingesting New Testament from local files ===');
  const localBooks = discoverLocalBooks();
  for (const [bookName, info] of Object.entries(localBooks)) {
    for (const chapter of info.chapters) {
      const verses = readLocalChapter(bookName, chapter);
      for (const v of verses) {
        if (!existingSet.has(v.reference)) {
          allVerses.push(v);
          existingSet.add(v.reference);
        }
      }
    }
  }
  console.log(`After NT: ${allVerses.length} verses`);

  // === Old Testament from bible-api.com ===
  console.log('\n=== Ingesting Old Testament from bible-api.com ===');
  console.log('(This may take a while due to rate limiting)\n');

  let otTotal = 0;
  let otFailed = 0;

  for (const book of OT_BOOKS) {
    let bookVerses = 0;
    let bookFails = 0;

    console.log(`${book.pt} (${book.slug}, ${book.chapters} chapters)...`);

    for (let ch = 1; ch <= book.chapters; ch++) {
      const verses = await fetchChapter(book.slug, ch);

      if (verses && verses.length > 0) {
        for (const v of verses) {
          if (!existingSet.has(v.reference)) {
            allVerses.push(v);
            existingSet.add(v.reference);
          }
        }
        bookVerses += verses.length;
      } else {
        bookFails++;
        otFailed++;
      }

      otTotal++;
      await new Promise(r => setTimeout(r, DELAY_MS));
    }

    console.log(`  ${book.pt}: ${bookVerses} verses${bookFails > 0 ? ` (${bookFails} chapters failed)` : ''}`);

    // Save progress after each book
    const saveSet = new Map();
    for (const v of allVerses) {
      if (v.text && v.text.trim().length > 0 && !saveSet.has(v.reference)) {
        saveSet.set(v.reference, v);
      }
    }
    fs.writeFileSync(VERSES_PATH, JSON.stringify(Array.from(saveSet.values())), 'utf-8');
  }

  // Build final unique set
  const unique = new Map();
  for (const v of allVerses) {
    if (v.text && v.text.trim().length > 0) {
      if (!unique.has(v.reference)) {
        unique.set(v.reference, v);
      }
    }
  }

  allVerses = Array.from(unique.values());
  const bookNames = [...new Set(allVerses.map(v => v.reference.split(' ')[0]))];

  console.log(`\nTotal: ${allVerses.length} verses across ${bookNames.length} books`);
  console.log(`OT failed chapters: ${otFailed}/${otTotal}`);
  console.log('Books:', bookNames.sort().join(', '));

  fs.writeFileSync(VERSES_PATH, JSON.stringify(allVerses), 'utf-8');
  console.log(`\nSaved to ${VERSES_PATH}`);

  const { buildIndex } = require('./store');
  buildIndex();
  console.log('Search index rebuilt.\n');

  console.log(`Done! ${allVerses.length} verses ready for search.`);
}

module.exports = { ingestBible };