import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, MEDIA_DIR } from './db.js';
import { scan } from './scanner.js';

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
    `SELECT f.id, f.season, f.episode, p.position, p.duration FROM files f
     LEFT JOIN progress p ON p.file_id = f.id WHERE f.title_id=? ORDER BY f.season, f.episode, f.path`
  ).all(title.id);
  return { ...title, files };
});

app.get('/api/continue', () =>
  db.prepare(
    `SELECT f.id AS file_id, t.id AS title_id, t.name, t.poster, t.backdrop, f.season, f.episode, p.position, p.duration
     FROM progress p JOIN files f ON f.id = p.file_id JOIN titles t ON t.id = f.title_id
     WHERE p.position > 10 AND p.position < p.duration - 30
     ORDER BY p.updated_at DESC LIMIT 12`
  ).all()
);

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
