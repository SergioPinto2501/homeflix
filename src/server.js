import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, MEDIA_DIR } from './db.js';
import { scan } from './scanner.js';
import { searchMulti, providers } from './tmdb.js';
import { iaSearch, iaPick, GENRES } from './catalog.js';
import { addJob, jobs, download, convertFile, tempDir, safeName, VIDEO_EXT } from './jobs.js';
import { pipeline } from 'node:stream/promises';

const PORT = +process.env.PORT || 3000;
const MIME = { '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.mkv': 'video/x-matroska' };
const app = Fastify({ logger: { level: 'warn' } });

await app.register(fastifyStatic, {
  root: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public'),
});

app.get('/api/titles', (req) => {
  const q = `%${(req.query.q || '').trim()}%`;
  return db.prepare('SELECT * FROM titles WHERE name LIKE ? ORDER BY name COLLATE NOCASE').all(q);
});

app.get('/api/titles/:id', (req, reply) => {
  const title = db.prepare('SELECT * FROM titles WHERE id=?').get(req.params.id);
  if (!title) return reply.code(404).send({ error: 'Titolo non trovato' });
  const files = db.prepare(
    `SELECT f.id, f.season, f.episode, p.position, p.duration, p.updated_at FROM files f
     LEFT JOIN progress p ON p.file_id = f.id WHERE f.title_id=? ORDER BY f.season, f.episode, f.path`
  ).all(title.id);
  return { ...title, files };
});

// "Continua a guardare": una sola scheda per titolo. Per le serie è l'ultimo episodio guardato
// (o il successivo, se quello l'hai finito); un titolo finito senza seguito non compare.
app.get('/api/continue', () => {
  const rows = db.prepare(
    `SELECT f.id AS file_id, t.id AS title_id, t.name, t.poster, t.backdrop, t.kind, f.season, f.episode, p.position, p.duration
     FROM progress p JOIN files f ON f.id = p.file_id JOIN titles t ON t.id = f.title_id
     ORDER BY p.updated_at DESC`
  ).all();
  const norm = (r) => r.kind + ':' + r.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
  const seen = new Set(), out = [];
  for (const r of rows) {
    if (seen.has(norm(r))) continue;
    seen.add(norm(r));
    if (r.position > 10 && r.position < r.duration - 30) { out.push(r); continue; }
    if (r.position <= 10 || r.kind !== 'series') continue;
    const eps = db.prepare('SELECT id, season, episode FROM files WHERE title_id=? ORDER BY season, episode, path').all(r.title_id);
    const next = eps[eps.findIndex((e) => e.id === r.file_id) + 1];
    if (next) out.push({ ...r, file_id: next.id, season: next.season, episode: next.episode, position: 0, duration: 0 });
  }
  return out.slice(0, 12);
});

app.put('/api/progress/:fileId', (req) => {
  const { position, duration } = req.body || {};
  db.prepare(
    `INSERT INTO progress (file_id, position, duration, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (file_id) DO UPDATE SET position=excluded.position, duration=excluded.duration, updated_at=excluded.updated_at`
  ).run(req.params.fileId, +position || 0, +duration || 0, Date.now());
  return { ok: true };
});

app.post('/api/scan', async (req, reply) => {
  try { return await scan(); } catch (e) { return reply.code(500).send({ error: e.message }); }
});

const fail = (reply, e) => reply.code(400).send({ error: e.message === 'fetch failed' ? 'Connessione a internet non disponibile' : e.message });

// --- lista desideri e disponibilità in streaming (TMDB / JustWatch) ---
app.get('/api/discover', async (req, reply) => { try { return await searchMulti(req.query.q || ''); } catch (e) { return fail(reply, e); } });
app.get('/api/providers', async (req, reply) => { try { return await providers(req.query.kind, req.query.tmdb_id); } catch (e) { return fail(reply, e); } });
app.get('/api/wishlist', () => db.prepare(
  `SELECT w.*, EXISTS(SELECT 1 FROM titles t WHERE t.tmdb_id = w.tmdb_id AND t.kind = w.kind) AS in_library
   FROM wishlist w ORDER BY w.added_at DESC`).all());
app.post('/api/wishlist', (req, reply) => {
  const b = req.body || {};
  if (!b.tmdb_id || !['movie', 'series'].includes(b.kind) || !b.name) return reply.code(400).send({ error: 'Dati mancanti' });
  db.prepare('INSERT OR IGNORE INTO wishlist (tmdb_id, kind, name, year, poster, overview, added_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(+b.tmdb_id, b.kind, String(b.name), +b.year || 0, b.poster || null, b.overview || null, Date.now());
  return { ok: true };
});
app.delete('/api/wishlist/:id', (req) => { db.prepare('DELETE FROM wishlist WHERE id=?').run(req.params.id); return { ok: true }; });

// --- aggiungere video: caricamento dal browser e catalogo libero (Internet Archive) ---
app.addContentTypeParser('application/octet-stream', (req, payload, done) => done(null, payload));
app.post('/api/upload', async (req, reply) => {
  const name = safeName(req.query.name || '');
  if (!VIDEO_EXT.test(name)) return reply.code(400).send({ error: 'Formato non supportato' });
  const file = path.join(tempDir(), name), lang = String(req.query.lang || 'ita');
  await pipeline(req.body, fs.createWriteStream(file));
  return { job: addJob(name, (j) => convertFile(j, file, lang)) };
});
app.get('/api/jobs', () => jobs);
app.get('/api/catalog/search', async (req, reply) => { try { return await iaSearch(req.query.q || '', req.query.genre || ''); } catch (e) { return fail(reply, e); } });
app.get('/api/catalog/genres', () => GENRES.map(({ key, label }) => ({ key, label })));
app.post('/api/catalog/download', async (req, reply) => {
  const { id, lang } = req.body || {};
  if (!/^[\w.-]+$/.test(id || '')) return reply.code(400).send({ error: 'Identificativo non valido' });
  try {
    const info = await iaPick(id);
    if (!info.file) return reply.code(404).send({ error: 'Nessun file video disponibile per questo titolo' });
    const file = path.join(tempDir(), safeName(info.year ? `${info.title} (${info.year})` : info.title) + path.extname(info.file.name));
    const url = `https://archive.org/download/${encodeURIComponent(id)}/${info.file.name.split('/').map(encodeURIComponent).join('/')}`;
    const job = addJob(info.title, async (j) => { await download(j, url, file); await convertFile(j, file, String(lang || 'ita')); });
    return { job, license: info.license };
  } catch (e) { return fail(reply, e); }
});

// Streaming con HTTP range: permette seek e riproduzione senza scaricare tutto il file
app.get('/stream/:id', (req, reply) => {
  const row = db.prepare('SELECT path FROM files WHERE id=?').get(req.params.id);
  if (!row) return reply.code(404).send();
  const full = path.join(MEDIA_DIR, row.path);
  if (!fs.existsSync(full)) return reply.code(404).send();
  const { size } = fs.statSync(full);
  const type = MIME[path.extname(full).toLowerCase()] || 'application/octet-stream';
  const range = req.headers.range;
  reply.header('Accept-Ranges', 'bytes').type(type);
  if (!range) return reply.header('Content-Length', size).send(fs.createReadStream(full));
  const [s, e] = range.replace('bytes=', '').split('-');
  const start = +s || 0;
  const end = e ? Math.min(+e, size - 1) : size - 1;
  if (start >= size || start > end) return reply.code(416).header('Content-Range', `bytes */${size}`).send();
  return reply
    .code(206)
    .headers({ 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 })
    .send(fs.createReadStream(full, { start, end }));
});

try { await scan(); } catch (e) { app.log.warn(e.message); }
await app.listen({ port: PORT, host: '0.0.0.0' });
console.log(`HomeFlix in ascolto su http://0.0.0.0:${PORT}  (media: ${MEDIA_DIR})`);
