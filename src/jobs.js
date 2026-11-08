// Coda dei lavori (caricamenti, download, conversioni): uno alla volta, per non sovraccaricare il Raspberry
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { DATA_DIR, MEDIA_DIR } from './db.js';
import { scan } from './scanner.js';

export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(DATA_DIR, 'uploads'));
export const VIDEO_EXT = /\.(avi|mkv|mp4|m4v|mov|wmv|asf|flv|mpg|mpeg|ts|m2ts|mts|vob|webm|divx|3gp|ogm|ogv|rmvb)$/i;
const CONVERT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'convert.js');
export const safeName = (n) => path.basename(String(n)).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim() || 'video';
export const tempDir = () => { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); return fs.mkdtempSync(path.join(UPLOAD_DIR, 'j-')); };

export const jobs = [];
const queue = [];
let busy = false, seq = 1;

export function addJob(label, run) {
  const job = { id: seq++, label, status: 'in coda', detail: '' };
  jobs.unshift(job); jobs.length = Math.min(jobs.length, 30);
  queue.push({ job, run });
  pump();
  return job;
}
async function pump() {
  if (busy) return;
  busy = true;
  while (queue.length) {
    const { job, run } = queue.shift();
    try { await run(job); job.status = 'completato'; } catch (e) { job.status = 'errore'; job.detail = e.message; }
  }
  busy = false;
}

export async function download(job, url, dest) {
  job.status = 'download';
  const r = await fetch(url, { headers: { 'User-Agent': 'HomeFlix/0.1' } });
  if (!r.ok) throw new Error('download non riuscito (' + r.status + ')');
  const total = +r.headers.get('content-length') || 0;
  let got = 0;
  const rs = Readable.fromWeb(r.body);
  rs.on('data', (c) => { got += c.length; job.detail = total ? `${Math.round((got / total) * 100)}% di ${(total / 1e6) | 0} MB` : `${(got / 1e6) | 0} MB`; });
  await pipeline(rs, fs.createWriteStream(dest));
}

// Usa lo stesso script di conversione da riga di comando, poi aggiorna la libreria
export function convertFile(job, file, lang = 'ita') {
  return new Promise((resolve, reject) => {
    job.status = 'conversione'; job.detail = '';
    const p = spawn(process.execPath, [CONVERT, file, '--out', MEDIA_DIR, '--lang', lang], { env: process.env });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => { const m = String(d).match(/time=(\S+)/g); if (m) job.detail = 'elaborati ' + m.at(-1).slice(5); });
    p.on('close', async (code) => {
      fs.rmSync(path.dirname(file), { recursive: true, force: true });
      const done = /(\d+) convertiti, (\d+) già presenti, (\d+) falliti/.exec(out);
      if (code === 0 && done && +done[1] > 0) { await scan().catch(() => {}); job.detail = 'aggiunto alla libreria'; resolve(); }
      else if (done && +done[2] > 0) { job.detail = 'già in libreria'; resolve(); }
      else reject(new Error(out.trim().split('\n').slice(-3).join(' ') || 'conversione non riuscita'));
    });
  });
}
