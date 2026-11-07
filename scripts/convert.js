// Converte file .avi (XviD ecc.) in MP4 (H.264 + AAC) leggibili da HomeFlix,
// scegliendo automaticamente la traccia audio nella lingua voluta (default: italiano).
//
// Uso:  npm run convert -- "C:\Video\Mr.Robot.S01.ITA.ENG.XviD" [--out cartella] [--lang ita]
//                          [--crf 20] [--preset fast] [--dry-run]
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string' },
    lang: { type: 'string', default: 'ita' },
    crf: { type: 'string', default: '20' },
    preset: { type: 'string', default: 'fast' },
    'dry-run': { type: 'boolean', default: false },
  },
});

const src = positionals[0];
if (!src) {
  console.log('Uso: npm run convert -- "<cartella o file .avi>" [--out <cartella>] [--lang ita] [--crf 20] [--preset fast] [--dry-run]');
  process.exit(1);
}
const OUT = path.resolve(opt.out || process.env.MEDIA_DIR || './media');

// --- lingue -----------------------------------------------------------------
const CANON = { ita: 'ita', eng: 'eng', fre: 'fre', fra: 'fre', ger: 'ger', deu: 'ger', spa: 'spa', jpn: 'jpn' };
const ALIASES = { ita: ['ita', 'it', 'ital'], eng: ['eng', 'en'], fre: ['fre', 'fra', 'fr'], ger: ['ger', 'deu', 'de'], spa: ['spa', 'es'], jpn: ['jpn', 'ja'] };
const lang = CANON[opt.lang.toLowerCase()] || opt.lang.toLowerCase();
const aliases = ALIASES[lang] || [lang];
const LANG_RE = new RegExp(`(?<![A-Za-z])(${Object.keys(CANON).join('|')})(?![A-Za-z])`, 'gi');

// Ordine delle lingue scritto nel nome ("ITA.ENG" -> [ita, eng])
const order = (s) => [...new Set([...s.matchAll(LANG_RE)].map((m) => CANON[m[1].toLowerCase()]))];

function pickAudio(audios, file) {
  // 1) metadato di lingua dentro il file
  let i = audios.findIndex((s) => {
    const l = (s.tags?.language || '').toLowerCase();
    const t = (s.tags?.title || '').toLowerCase();
    return aliases.includes(l) || aliases.some((a) => a.length > 2 && t.includes(a));
  });
  if (i >= 0) return { i, why: 'metadato di lingua' };
  // 2) ordine delle lingue nel nome del file (poi della cartella): ITA.ENG = prima traccia italiana
  const names = [path.basename(file), path.basename(path.dirname(file))];
  for (const n of names) {
    const o = order(n);
    const k = o.indexOf(lang);
    if (o.length > 1 && k >= 0 && k < audios.length) return { i: k, why: `ordine nel nome (${o.join(' ').toUpperCase()})` };
  }
  // 3) nessun indizio
  return { i: 0, why: 'prima traccia, lingua non rilevabile' };
}

// --- nomi di destinazione ----------------------------------------------------
const clean = (s) => s.replace(/[._]+/g, ' ').replace(/\s+/g, ' ').replace(/^[\s-]+|[\s-]+$/g, '');
const safe = (s) => s.replace(/[<>:"/\\|?*]/g, '').trim();
const pad = (n) => String(n).padStart(2, '0');
const JUNK = /[. _-]+(ITA|ENG|MULTI|BDMUX|BLURAY|BRRIP|DVDRIP|WEBRIP|WEB-DL|HDTV|XVID|X264|720P|1080P|480P)\b.*$/i;

function target(file) {
  const base = path.basename(file, path.extname(file));
  const m = base.match(/^(.*?)[. _-]*S(\d{1,2})\s?E(\d{1,3})/i) || base.match(/^(.*?)[. _-]*\b(\d{1,2})x(\d{1,3})\b/i);
  if (m) {
    let name = clean(m[1]);
    if (!name) {
      const folder = path.basename(path.dirname(file));
      name = clean(folder.replace(/[. _-]*S\d{1,2}\b.*$/i, '')) || clean(folder);
    }
    name = safe(name);
    return path.join(OUT, name, `S${pad(m[2])}`, `${name} S${pad(m[2])}E${pad(m[3])}.mp4`);
  }
  const y = base.match(/^(.*?)[. _(\[-]+((?:19|20)\d{2})(?!\d)/);
  const name = y && clean(y[1]) ? `${clean(y[1])} (${y[2]})` : clean(base.replace(JUNK, ''));
  return path.join(OUT, `${safe(name)}.mp4`);
}

// --- ffmpeg ------------------------------------------------------------------
function need(cmd) {
  try { execFileSync(cmd, ['-version'], { stdio: 'ignore' }); } catch {
    console.error(`${cmd} non trovato. Windows: winget install Gyan.FFmpeg (poi riapri il terminale). Raspberry/Linux: sudo apt install ffmpeg`);
    process.exit(1);
  }
}
const probe = (f) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', f], { encoding: 'utf8', maxBuffer: 1 << 26 })).streams;

function* walk(p) {
  const st = fs.statSync(p);
  if (st.isFile()) { if (/\.avi$/i.test(p)) yield p; return; }
  for (const e of fs.readdirSync(p, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) yield* walk(path.join(p, e.name));
}

need('ffmpeg'); need('ffprobe');
const files = [...walk(path.resolve(src))];
if (!files.length) { console.log('Nessun file .avi trovato.'); process.exit(0); }
console.log(`${files.length} file .avi trovati. Destinazione: ${OUT}  (audio: ${lang.toUpperCase()})${opt['dry-run'] ? '  [PROVA, non converto]' : ''}\n`);

let ok = 0, skipped = 0, failed = 0;
files.forEach((file, n) => {
  const dest = target(file);
  console.log(`[${n + 1}/${files.length}] ${path.basename(file)}\n  -> ${path.relative(OUT, dest)}`);
  if (fs.existsSync(dest)) { console.log('  già presente, salto'); skipped++; return; }
  let streams;
  try { streams = probe(file); } catch { console.log('  file illeggibile, salto'); failed++; return; }
  const v = streams.find((s) => s.codec_type === 'video');
  const audios = streams.filter((s) => s.codec_type === 'audio');
  if (!v || !audios.length) { console.log('  manca video o audio, salto'); failed++; return; }
  const { i, why } = pickAudio(audios, file);
  const a = audios[i];
  console.log(`  audio: traccia ${i + 1} di ${audios.length} (${a.codec_name}${a.tags?.language ? ', ' + a.tags.language : ''}) scelta da: ${why}`);
  if (opt['dry-run']) return;

  const copyV = v.codec_name === 'h264' && v.pix_fmt === 'yuv420p';
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = dest + '.part';
  const args = ['-hide_banner', '-loglevel', 'error', '-stats', '-i', file, '-map', '0:v:0', '-map', `0:a:${i}`, '-sn',
    ...(copyV ? ['-c:v', 'copy'] : ['-c:v', 'libx264', '-preset', opt.preset, '-crf', opt.crf, '-pix_fmt', 'yuv420p']),
    '-c:a', 'aac', '-b:a', '160k', '-ac', '2', '-movflags', '+faststart', '-f', 'mp4', '-y', tmp];
  const r = spawnSync('ffmpeg', args, { stdio: 'inherit' });
  if (r.status === 0) { fs.renameSync(tmp, dest); ok++; console.log('  fatto\n'); }
  else { fs.rmSync(tmp, { force: true }); failed++; console.log('  ERRORE nella conversione\n'); }
});
console.log(`\nFinito: ${ok} convertiti, ${skipped} già presenti, ${failed} falliti.`);
if (ok) console.log('Ora premi "Aggiorna" in HomeFlix.');
