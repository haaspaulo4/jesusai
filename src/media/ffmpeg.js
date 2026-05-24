const { execFile } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs').promises;
const fsSync = require('fs');

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';

function tmpFile(ext) {
  return path.join(os.tmpdir(), `ffmpeg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`);
}

function execFFmpeg(args, timeout = 30000) {
  return new Promise((resolve, reject) => {
    execFile(FFMPEG, args, { timeout }, (err, stdout, stderr) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}

function execFFprobe(args, timeout = 10000) {
  return new Promise((resolve, reject) => {
    execFile(FFPROBE, args, { timeout }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}

async function convertAudio(inputBuffer, format, options = {}) {
  const inExt = options.inputFormat || 'wav';
  const inFile = tmpFile(inExt);
  const outFile = tmpFile(format);
  try {
    fsSync.writeFileSync(inFile, inputBuffer);
    const args = ['-y', '-i', inFile];
    if (format === 'ogg' || format === 'opus') {
      args.push('-c:a', 'libopus', '-b:a', (options.bitrate || '48k'), '-vbr', 'on');
      if (options.sampleRate) args.push('-ar', String(options.sampleRate));
    } else if (format === 'mp3') {
      args.push('-c:a', 'libmp3lame', '-b:a', (options.bitrate || '64k'));
      if (options.sampleRate) args.push('-ar', String(options.sampleRate));
    } else if (format === 'wav') {
      args.push('-c:a', 'pcm_s16le');
      if (options.sampleRate) args.push('-ar', String(options.sampleRate));
      if (options.channels) args.push('-ac', String(options.channels));
    } else if (format === 'flac') {
      args.push('-c:a', 'flac');
    } else if (format === 'm4a') {
      args.push('-c:a', 'aac', '-b:a', (options.bitrate || '64k'));
    } else {
      args.push('-c:a', 'copy');
    }
    args.push(outFile);
    await execFFmpeg(args);
    return fsSync.readFileSync(outFile);
  } finally {
    try { fsSync.unlinkSync(inFile); } catch {}
    try { fsSync.unlinkSync(outFile); } catch {}
  }
}

async function convertToOggOpus(inputBuffer, inputFormat = 'wav') {
  return convertAudio(inputBuffer, 'ogg', { inputFormat: inputFormat, bitrate: '48k' });
}

async function convertToMp3(inputBuffer, inputFormat = 'wav', bitrate = '64k') {
  return convertAudio(inputBuffer, 'mp3', { inputFormat, bitrate });
}

async function convertToWav(inputBuffer, inputFormat, options = {}) {
  return convertAudio(inputBuffer, 'wav', {
    inputFormat,
    sampleRate: options.sampleRate || 16000,
    channels: options.channels || 1,
  });
}

async function concatAudio(buffers, inputFormat = 'wav', outputFormat = 'wav') {
  if (!buffers || buffers.length === 0) return null;
  if (buffers.length === 1) return convertAudio(buffers[0], outputFormat, { inputFormat });

  const listFile = tmpFile('txt');
  const outFormat = outputFormat === 'ogg' ? 'ogg' : outputFormat === 'mp3' ? 'mp3' : 'wav';
  const outFile = tmpFile(outFormat);
  const inFiles = [];
  try {
    for (let i = 0; i < buffers.length; i++) {
      const inFile = tmpFile(inputFormat);
      fsSync.writeFileSync(inFile, buffers[i]);
      inFiles.push(inFile);
    }
    const listContent = inFiles.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n');
    fsSync.writeFileSync(listFile, listContent);

    const args = ['-y', '-f', 'concat', '-safe', '0', '-i', listFile];
    if (outputFormat === 'ogg' || outputFormat === 'opus') {
      args.push('-c:a', 'libopus', '-b:a', '48k', '-vbr', 'on');
    } else if (outputFormat === 'mp3') {
      args.push('-c:a', 'libmp3lame', '-b:a', '64k');
    } else {
      args.push('-c:a', 'pcm_s16le');
    }
    args.push(outFile);
    await execFFmpeg(args);
    return fsSync.readFileSync(outFile);
  } finally {
    for (const f of inFiles) { try { fsSync.unlinkSync(f); } catch {} }
    try { fsSync.unlinkSync(listFile); } catch {}
    try { fsSync.unlinkSync(outFile); } catch {}
  }
}

async function trimAudio(inputBuffer, startTime, duration, inputFormat = 'wav', outputFormat = 'ogg') {
  const inFile = tmpFile(inputFormat);
  const outFormat = outputFormat === 'ogg' ? 'ogg' : outputFormat === 'mp3' ? 'mp3' : 'wav';
  const outFile = tmpFile(outFormat);
  try {
    fsSync.writeFileSync(inFile, inputBuffer);
    const args = ['-y', '-i', inFile, '-ss', String(startTime), '-t', String(duration)];
    if (outputFormat === 'ogg') args.push('-c:a', 'libopus', '-b:a', '48k', '-vbr', 'on');
    else if (outputFormat === 'mp3') args.push('-c:a', 'libmp3lame', '-b:a', '64k');
    else args.push('-c:a', 'pcm_s16le');
    args.push(outFile);
    await execFFmpeg(args);
    return fsSync.readFileSync(outFile);
  } finally {
    try { fsSync.unlinkSync(inFile); } catch {}
    try { fsSync.unlinkSync(outFile); } catch {}
  }
}

async function extractAudio(inputBuffer, inputFormat = 'mp4', outputFormat = 'mp3') {
  const inFile = tmpFile(inputFormat);
  const outFile = tmpFile(outputFormat);
  try {
    fsSync.writeFileSync(inFile, inputBuffer);
    const args = ['-y', '-i', inFile, '-vn'];
    if (outputFormat === 'ogg') args.push('-c:a', 'libopus', '-b:a', '48k', '-vbr', 'on');
    else if (outputFormat === 'mp3') args.push('-c:a', 'libmp3lame', '-b:a', '128k');
    else if (outputFormat === 'wav') args.push('-c:a', 'pcm_s16le', '-ar', '16000', '-ac', '1');
    else args.push('-c:a', 'copy');
    args.push(outFile);
    await execFFmpeg(args);
    return fsSync.readFileSync(outFile);
  } finally {
    try { fsSync.unlinkSync(inFile); } catch {}
    try { fsSync.unlinkSync(outFile); } catch {}
  }
}

async function getAudioInfo(inputBuffer, inputFormat = 'wav') {
  const inFile = tmpFile(inputFormat);
  try {
    fsSync.writeFileSync(inFile, inputBuffer);
    const stdout = await execFFprobe([
      '-v', 'quiet', '-print_format', 'json',
      '-show_format', '-show_streams', inFile,
    ]);
    const data = JSON.parse(stdout);
    const audio = (data.streams || []).find(s => s.codec_type === 'audio');
    return {
      duration: parseFloat(data.format?.duration || 0) || null,
      format: data.format?.format_name || null,
      bitrate: parseInt(data.format?.bit_rate || 0) || null,
      channels: audio?.channels || null,
      sampleRate: parseInt(audio?.sample_rate || 0) || null,
      codec: audio?.codec_name || null,
    };
  } finally {
    try { fsSync.unlinkSync(inFile); } catch {}
  }
}

async function normalizeAudio(inputBuffer, inputFormat = 'wav', options = {}) {
  const sampleRate = options.sampleRate || 16000;
  const channels = options.channels || 1;
  const outputFormat = options.format || 'wav';
  const inFile = tmpFile(inputFormat);
  const outFormat = outputFormat === 'ogg' ? 'ogg' : outputFormat === 'mp3' ? 'mp3' : 'wav';
  const outFile = tmpFile(outFormat);
  try {
    fsSync.writeFileSync(inFile, inputBuffer);
    const args = [
      '-y', '-i', inFile,
      '-ar', String(sampleRate),
      '-ac', String(channels),
      '-af', 'aresample=resampler=soxr:precision=28',
    ];
    if (outputFormat === 'ogg') args.push('-c:a', 'libopus', '-b:a', '48k', '-vbr', 'on');
    else if (outputFormat === 'mp3') args.push('-c:a', 'libmp3lame', '-b:a', '64k');
    else args.push('-c:a', 'pcm_s16le');
    args.push(outFile);
    await execFFmpeg(args);
    return fsSync.readFileSync(outFile);
  } finally {
    try { fsSync.unlinkSync(inFile); } catch {}
    try { fsSync.unlinkSync(outFile); } catch {}
  }
}

async function generateWaveform(inputBuffer, inputFormat = 'wav', samples = 100) {
  const inFile = tmpFile(inputFormat);
  const outFile = tmpFile('json');
  try {
    fsSync.writeFileSync(inFile, inputBuffer);
    const args = ['-y', '-i', inFile, '-filter_complex', `aresample=${samples * 100},showwavespic=s=${samples}x64`, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', outFile];
    await execFFmpeg(args);
    if (fsSync.existsSync(outFile)) return fsSync.readFileSync(outFile);
    return null;
  } finally {
    try { fsSync.unlinkSync(inFile); } catch {}
    try { fsSync.unlinkSync(outFile); } catch {}
  }
}

async function isFfmpegAvailable() {
  try {
    await execFFmpeg(['-version'], 5000);
    return true;
  } catch { return false; }
}

module.exports = {
  convertToOggOpus,
  convertToMp3,
  convertToWav,
  convertAudio,
  concatAudio,
  trimAudio,
  extractAudio,
  getAudioInfo,
  normalizeAudio,
  generateWaveform,
  isFfmpegAvailable,
  execFFmpeg,
  execFFprobe,
};