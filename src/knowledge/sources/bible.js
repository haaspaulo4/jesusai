const { discoverLocalBooks, readLocalChapter } = require('../../utils/bible');

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

const DELAY_MS = 2000;

async function fetchChapter(bookSlug, chapter, apiBase, version) {
  const url = `${apiBase}/${encodeURIComponent(bookSlug)}+${chapter}?translation=${version}`;

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

async function bibleIngester(sourceConfig) {
  const fs = require('fs');
  const path = require('path');

  const BIBLE_API_BASE = process.env.BIBLE_API_BASE || 'https://bible-api.com';
  const BIBLE_VERSION = process.env.BIBLE_VERSION || 'almeida';
  const dataDir = path.join(__dirname, '..', '..', '..', 'data');

  const localBooks = discoverLocalBooks();
  let allVerses = [];

  console.log('=== Ingesting New Testament from local files ===');
  for (const [bookName, info] of Object.entries(localBooks)) {
    for (const chapter of info.chapters) {
      const verses = readLocalChapter(bookName, chapter);
      allVerses.push(...verses);
    }
  }
  console.log(`After NT: ${allVerses.length} verses`);

  console.log('\n=== Ingesting Old Testament from bible-api.com ===');
  console.log('(This may take a while due to rate limiting)\n');

  let otTotal = 0;
  let otFailed = 0;

  for (const book of OT_BOOKS) {
    let bookVerses = 0;
    let bookFails = 0;

    console.log(`${book.pt} (${book.slug}, ${book.chapters} chapters)...`);

    for (let ch = 1; ch <= book.chapters; ch++) {
      const verses = await fetchChapter(book.slug, ch, BIBLE_API_BASE, BIBLE_VERSION);

      if (verses && verses.length > 0) {
        allVerses.push(...verses);
        bookVerses += verses.length;
      } else {
        bookFails++;
        otFailed++;
      }

      otTotal++;
      await new Promise(r => setTimeout(r, DELAY_MS));
    }

    console.log(`  ${book.pt}: ${bookVerses} verses${bookFails > 0 ? ` (${bookFails} chapters failed)` : ''}`);
  }

  const bookNames = [...new Set(allVerses.map(v => v.reference.split(' ')[0]))];
  console.log(`\nTotal: ${allVerses.length} verses across ${bookNames.length} books`);
  console.log(`OT failed chapters: ${otFailed}/${otTotal}`);

  return allVerses;
}

module.exports = bibleIngester;