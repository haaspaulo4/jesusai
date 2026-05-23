require('dotenv').config();
const { pool } = require('./src/db');

const COLUMNS = [
  'avatar_url TEXT',
  'avatar_style VARCHAR(50) DEFAULT "realistic"',
  'palette JSON',
  'font_family VARCHAR(100) DEFAULT "Inter"',
  'emoji_style VARCHAR(50) DEFAULT "native"',
  'background_style JSON',
  'animation_style VARCHAR(50) DEFAULT "subtle"',
  'accent_color VARCHAR(20) DEFAULT "#D4A843"',
  'avatar_video_url TEXT',
  'avatar_audio_greeting TEXT',
  'cover_image_url TEXT',
  'media_gallery JSON',
  'response_media_enabled TINYINT(1) DEFAULT 1',
];

(async () => {
  for (const col of COLUMNS) {
    const name = col.split(' ')[0];
    try {
      await pool.execute(`ALTER TABLE personas ADD COLUMN ${col}`);
      console.log(`Added: ${name}`);
    } catch (e) {
      if (e.message.includes('Duplicate')) {
        console.log(`Exists: ${name}`);
      } else {
        console.error(`Error ${name}: ${e.message}`);
      }
    }
  }
  console.log('Migration complete.');
  process.exit(0);
})();
