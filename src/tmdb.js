// Ricerca titoli e disponibilità in streaming (dati JustWatch) tramite le API di TMDB
const IMG = 'https://image.tmdb.org/t/p/';
async function get(p, params = {}) {
  if (!process.env.TMDB_API_KEY) throw new Error('Serve la chiave TMDB_API_KEY nel file .env');
  const q = new URLSearchParams({ api_key: process.env.TMDB_API_KEY, language: 'it-IT', ...params });
  const r = await fetch(`https://api.themoviedb.org/3${p}?${q}`);
  if (!r.ok) throw new Error('TMDB ha risposto con errore ' + r.status);
  return r.json();
}

export async function searchMulti(query) {
  if (!query.trim()) return [];
  const d = await get('/search/multi', { query });
  return d.results.filter((x) => x.media_type === 'movie' || x.media_type === 'tv').slice(0, 12).map((x) => ({
    tmdb_id: x.id, kind: x.media_type === 'tv' ? 'series' : 'movie', name: x.title || x.name,
    year: +(x.release_date || x.first_air_date || '').slice(0, 4) || 0,
    poster: x.poster_path ? IMG + 'w185' + x.poster_path : null, overview: x.overview || '',
  }));
}

const cache = new Map();
export async function providers(kind, id) {
  if (!/^\d+$/.test(String(id)) || !['movie', 'series'].includes(kind)) throw new Error('Richiesta non valida');
  const key = kind + id, hit = cache.get(key);
  if (hit && Date.now() - hit.t < 6 * 3600e3) return hit.v;
  const region = (process.env.TMDB_REGION || 'IT').toUpperCase();
  const d = await get(`/${kind === 'series' ? 'tv' : 'movie'}/${id}/watch/providers`);
  const r = d.results?.[region] || {};
  const m = (a) => (a || []).map((p) => ({ name: p.provider_name, logo: p.logo_path ? IMG + 'w92' + p.logo_path : null }));
  const v = { region, link: r.link || null, flatrate: m(r.flatrate), rent: m(r.rent), buy: m(r.buy) };
  cache.set(key, { t: Date.now(), v });
  return v;
}

// Nomi dei generi in italiano (cache): "Dramma,Thriller"
let gmap;
export async function genreNames(ids = []) {
  if (!gmap) {
    const m = new Map();
    for (const t of ['movie', 'tv']) (await get(`/genre/${t}/list`)).genres.forEach((g) => m.set(g.id, g.name));
    gmap = m;
  }
  return [...new Set(ids.map((i) => gmap.get(i)).filter(Boolean))];
}
