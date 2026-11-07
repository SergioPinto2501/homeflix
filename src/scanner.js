import fs from 'node:fs';
import path from 'node:path';
import { db, MEDIA_DIR } from './db.js';

const EXT = new Set(['.mp4', '.m4v', '.webm', '.mkv']);
const TMDB_KEY = process.env.TMDB_API_KEY;

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (EXT.has(path.extname(e.name).toLowerCase())) yield p;
  }
}

const clean = (s) => s.replace(/[._]/g, ' ').replace(/\s+/g, ' ').replace(/[-\s(]+$/, '').trim();

// "Serie/S01/Serie S01E03.mp4" -> serie;  "Film (2019).mp4" -> film
export function parseName(rel) {
  const parts = rel.split(path.sep);
  const base = path.basename(rel, path.extname(rel));
  const m = base.match(/S(\d{1,2})\s?E(\d{1,3})/i) || base.match(/\b(\d{1,2})x(\d{1,3})\b/i);
  if (m) {
    const fromFile = clean(base.slice(0, m.index));
    const name = parts.length > 1 ? clean(parts[0]) : fromFile;
    return { kind: 'series', name: name || fromFile || base, year: 0, season: +m[1], episode: +m[2] };
  }
  const y = base.match(/\(?\b((?:19|20)\d{2})\b\)?/);
  const name = clean(y && y.index > 0 ? base.slice(0, y.index) : base);
  return { kind: 'movie', name: name || base, year: y ? +y[1] : 0, season: null, episode: null };
}

async function tmdb(t) {
  const type = t.kind === 'movie' ? 'movie' : 'tv';
  const q = new URLSearchParams({ api_key: TMDB_KEY, language: 'it-IT', query: t.name });
  if (t.year && t.kind === 'movie') q.set('year', t.year);
  try {
    const r = await fetch(`https://api.themoviedb.org/3/search/${type}?${q}`);
    const hit = (await r.json()).results?.[0];
    if (!hit) return;
    db.prepare('UPDATE titles SET poster=?, backdrop=?, overview=? WHERE id=?').run(
      hit.poster_path ? `https://image.tmdb.org/t/p/w342${hit.poster_path}` : null,
      hit.backdrop_path ? `https://image.tmdb.org/t/p/w1280${hit.backdrop_path}` : null,
      hit.overview || null,
      t.id
    );
  } catch { /* offline: riproverà al prossimo scan */ }
}

export async function scan() {
  if (!fs.existsSync(MEDIA_DIR)) throw new Error(`Cartella non trovata: ${MEDIA_DIR}`);
  const upsertTitle = db.prepare(
    `INSERT INTO titles (kind, name, year) VALUES (?, ?, ?)
     ON CONFLICT (kind, name, year) DO UPDATE SET name = name RETURNING id`
  );
  const findTitle = db.prepare('SELECT id FROM titles WHERE kind=? AND name=? AND year = ?');
  const upsertFile = db.prepare(
    `INSERT INTO files (title_id, season, episode, path) VALUES (?, ?, ?, ?)
     ON CONFLICT (path) DO UPDATE SET title_id=excluded.title_id, season=excluded.season, episode=excluded.episode`
  );
  const seen = [];
  db.exec('BEGIN');
  try {
    for (const full of walk(MEDIA_DIR)) {
      const rel = path.relative(MEDIA_DIR, full);
      const p = parseName(rel);
      upsertTitle.run(p.kind, p.name, p.year);
      const { id } = findTitle.get(p.kind, p.name, p.year);
      upsertFile.run(id, p.season, p.episode, rel);
      seen.push(rel);
    }
    const all = db.prepare('SELECT id, path FROM files').all();
    const gone = all.filter((f) => !seen.includes(f.path));
    for (const f of gone) db.prepare('DELETE FROM files WHERE id=?').run(f.id);
    db.prepare('DELETE FROM titles WHERE id NOT IN (SELECT title_id FROM files)').run();
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  if (TMDB_KEY) {
    for (const t of db.prepare('SELECT * FROM titles WHERE backdrop IS NULL').all()) await tmdb(t);
  }
  return {
    titles: db.prepare('SELECT COUNT(*) n FROM titles').get().n,
    files: db.prepare('SELECT COUNT(*) n FROM files').get().n,
  };
}
