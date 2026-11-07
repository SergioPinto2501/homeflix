// Converte qualsiasi video (avi, mkv, mp4, mov, wmv, ts, vob, ...) in MP4 H.264 + AAC leggibile da HomeFlix.
// Qualità alta, nessun upscaling (la risoluzione originale non viene mai ingrandita).
// Se il video è già compatibile viene solo "travasato" senza perdita; altrimenti viene ricodificato.
// Sceglie da solo la traccia audio nella lingua voluta (default: italiano).
//
// Uso:  npm run convert -- "C:\Video\Cartella" [--out cartella] [--lang ita] [--crf 18]
//                          [--preset medium] [--max-height 1080] [--dry-run]
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string' },
    lang: { type: 'string', default: 'ita' },
    crf: { type: 'string', default: '18' },
    preset: { type: 'string', default: 'medium' },
    'max-height': { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});

const src = positionals[0];
if (!src) {
  console.log('Uso: npm run convert -- "<cartella o file>" [--out <cartella>] [--lang ita] [--crf 18] [--preset medium] [--max-height 1080] [--dry-run]');
  process.exit(1);
}
const OUT = path.resolve(opt.out || process.env.MEDIA_DIR || './media');
const MAXH = opt['max-height'] ? +opt['max-height'] : 0; // 0 = nessun limite (mai upscaling)
const VIDEO_EXT = /\.(avi|mkv|mp4|m4v|mov|wmv|asf|flv|mpg|mpeg|ts|m2ts|mts|vob|webm|divx|3gp|ogm|ogv|rmvb)$/i;

// --- lingue -----------------------------------------------------------------
const CANON = { ita: 'ita', eng: 'eng', fre: 'fre', fra: 'fre', ger: 'ger', deu: 'ger', spa: 'spa', jpn: 'jpn' };
const ALIASES = { ita: ['ita', 'it', 'ital'], eng: ['eng', 'en'], fre: ['fre', 'fra', 'fr'], ger: ['ger', 'deu', 'de'], spa: ['spa', 'es'], jpn: ['jpn', 'ja'] };
const lang = CANON[opt.lang.toLowerCase()] || opt.lang.toLowerCase();
const aliases = ALIASES[lang] || [lang];
const LANG_RE = new RegExp(`(?<![A-Za-z])(${Object.keys(CANON).join('|')})(?![A-Za-z])`, 'gi');
const order = (s) => [...new Set([...s.matchAll(LANG_RE)].map((m) => CANON[m[1].toLowerCase()]))];

function pickAudio(audios, file) {
  // 1) metadato di lingua dentro il file
  let k = audios.findIndex((s) => {
    const l = (s.tags?.language || '').toLowerCase();
    const t = (s.tags?.title || '').toLowerCase();
    return aliases.includes(l) || aliases.some((a) => a.length > 2 && t.includes(a));
  });
  if (k >= 0) return { a: audios[k], n: k, why: 'metadato di lingua', sure: true };
  // 2) ordine delle lingue scritto nel nome: ITA.ENG = prima traccia italiana
  for (const nm of [path.basename(file), path.basename(path.dirname(file))]) {
    const o = order(nm);
    k = o.indexOf(lang);
    if (o.length > 1 && k >= 0 && k < audios.length) return { a: audios[k], n: k, why: `ordine nel nome (${o.join(' ').toUpperCase()})`, sure: true };
  }
  // 3) nessun indizio
  return { a: audios[0], n: 0, why: 'prima traccia, lingua non rilevabile', sure: false };
}

// --- nomi di destinazione ----------------------------------------------------
const clean = (s) => s.replace(/[._]+/g, ' ').replace(/\s+/g, ' ').replace(/^[\s-]+|[\s-]+$/g, '');
const safe = (s) => s.replace(/[<>:"/\\|?*]/g, '').trim();
const pad = (n) => String(n).padStart(2, '0');
const JUNK = /[. _-]+(ITA|ENG|MULTI|BDMUX|BLURAY|BRRIP|DVDRIP|WEBRIP|WEB-DL|HDTV|XVID|X264|X265|HEVC|720P|1080P|2160P|480P)\b.*$/i;

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
need('ffmpeg'); need('ffprobe');
let hasZscale = false;
try { hasZscale = /zscale/.test(execFileSync('ffmpeg', ['-hide_banner', '-filters'], { encoding: 'utf8', maxBuffer: 1 << 24 })); } catch {}

const probe = (f) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', f], { encoding: 'utf8', maxBuffer: 1 << 26 })).streams;

// Decide cosa fare con il video: copiarlo così com'è oppure ricodificarlo (e con quali correzioni)
function planVideo(v) {
  const notes = [];
  const interlaced = ['tt', 'bb', 'tb', 'bt'].includes(v.field_order);
  const hdr = ['smpte2084', 'arib-std-b67'].includes(v.color_transfer);
  const sar = v.sample_aspect_ratio && !['1:1', '0:1', 'N/A'].includes(v.sample_aspect_ratio) ? v.sample_aspect_ratio : null;
  const tooTall = MAXH && v.height > MAXH;
  const okCodec = v.codec_name === 'h264' && v.pix_fmt === 'yuv420p' && ['Baseline', 'Constrained Baseline', 'Main', 'High'].includes(v.profile);
  if (okCodec && !interlaced && !hdr && !sar && !tooTall) return { copy: true, vf: [], notes: ['già H.264 compatibile: copia senza perdita'] };

  const vf = [];
  if (!okCodec) notes.push(`${v.codec_name}${v.pix_fmt ? ' ' + v.pix_fmt : ''} -> H.264`);
  if (interlaced) { vf.push('yadif=0:-1:0'); notes.push('deinterlaccio'); }
  if (hdr) {
    if (hasZscale) { vf.push('zscale=t=linear:npl=100', 'format=gbrpf32le', 'zscale=p=bt709', 'tonemap=tonemap=hable:desat=0', 'zscale=t=bt709:m=bt709:r=tv'); notes.push('HDR -> SDR (tone mapping)'); }
    else notes.push('HDR: questo ffmpeg non ha zscale, i colori potrebbero risultare spenti');
  }
  if (sar) { vf.push('scale=trunc(iw*sar/2)*2:ih'); notes.push(`correggo le proporzioni (pixel ${sar})`); }
  if (tooTall) { vf.push(`scale=-2:${MAXH}`); notes.push(`riduco a ${MAXH}p`); }
  vf.push('scale=trunc(iw/2)*2:trunc(ih/2)*2', 'setsar=1', 'format=yuv420p');
  return { copy: false, vf, hdrMapped: hdr && hasZscale, notes };
}

function* walk(p) {
  const st = fs.statSync(p);
  if (st.isFile()) { if (VIDEO_EXT.test(p)) yield p; return; }
  for (const e of fs.readdirSync(p, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) yield* walk(path.join(p, e.name));
}

const files = [...walk(path.resolve(src))];
if (!files.length) { console.log('Nessun file video trovato.'); process.exit(0); }
console.log(`${files.length} file trovati. Destinazione: ${OUT}  (audio: ${lang.toUpperCase()}, qualità CRF ${opt.crf}${MAXH ? `, max ${MAXH}p` : ', risoluzione originale'})${opt['dry-run'] ? '  [PROVA, non converto]' : ''}\n`);

let ok = 0, skipped = 0, failed = 0;
files.forEach((file, n) => {
  const dest = target(file);
  console.log(`[${n + 1}/${files.length}] ${path.basename(file)}\n  -> ${path.relative(OUT, dest)}`);
  if (path.resolve(dest) === path.resolve(file) || fs.existsSync(dest)) { console.log('  già presente, salto'); skipped++; return; }
  let streams;
  try { streams = probe(file); } catch { console.log('  file illeggibile, salto'); failed++; return; }
  const v = streams.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic);
  const audios = streams.filter((s) => s.codec_type === 'audio');
  if (!v || !audios.length) { console.log('  manca video o audio, salto'); failed++; return; }

  const { a, n: an, why, sure } = pickAudio(audios, file);
  const pv = planVideo(v);
  const aacOk = a.codec_name === 'aac' && (a.channels || 2) <= 2;
  console.log(`  video: ${v.width}x${v.height} ${pv.notes.join(', ')}`);
  console.log(`  audio: traccia ${an + 1} di ${audios.length} (${a.codec_name}${a.tags?.language ? ', ' + a.tags.language : ''}), scelta da: ${why}${aacOk ? ' - già AAC, copia' : ' -> AAC'}`);
  if (opt['dry-run']) return;

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = dest + '.part';
  const vArgs = pv.copy ? ['-c:v', 'copy', '-tag:v', 'avc1']
    : ['-vf', pv.vf.join(','), '-c:v', 'libx264', '-preset', opt.preset, '-crf', opt.crf, '-profile:v', 'high', '-tag:v', 'avc1',
       ...(pv.hdrMapped ? ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709'] : [])];
  const aArgs = aacOk ? ['-c:a', 'copy']
    : ['-af', 'aresample=async=1', '-c:a', 'aac', '-b:a', '192k', ...((a.channels || 2) > 2 ? ['-ac', '2'] : [])];
  const args = ['-hide_banner', '-loglevel', 'error', '-stats', '-i', file,
    '-map', `0:${v.index}`, '-map', `0:${a.index}`, '-sn', '-dn', '-map_metadata', '-1', '-map_chapters', '-1',
    ...vArgs, ...aArgs, ...(sure ? ['-metadata:s:a:0', `language=${lang}`] : []),
    '-movflags', '+faststart', '-f', 'mp4', '-y', tmp];
  const r = spawnSync('ffmpeg', args, { stdio: 'inherit' });
  if (r.status === 0) { fs.renameSync(tmp, dest); ok++; console.log('  fatto\n'); }
  else { fs.rmSync(tmp, { force: true }); failed++; console.log('  ERRORE nella conversione\n'); }
});
console.log(`\nFinito: ${ok} convertiti, ${skipped} già presenti, ${failed} falliti.`);
if (ok) console.log('Ora premi "Aggiorna" in HomeFlix.');
