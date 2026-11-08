// Cataloghi liberi: film di pubblico dominio / Creative Commons dell'Internet Archive
const UA = { 'User-Agent': 'HomeFlix/0.1 (server multimediale personale)' };
const VIDEO = /\.(mp4|m4v|mkv|avi|mov|mpg|mpeg|ogv|webm)$/i;

// Generi del catalogo libero: l'etichetta è quella mostrata, "q" la ricerca per soggetto sull'Internet Archive
export const GENRES = [
  { key: 'commedia', label: 'Commedia', q: 'comedy' }, { key: 'dramma', label: 'Dramma', q: 'drama' },
  { key: 'horror', label: 'Horror', q: 'horror' }, { key: 'fantascienza', label: 'Fantascienza', q: 'scifi OR "sci-fi" OR "science fiction"' },
  { key: 'western', label: 'Western', q: 'western' }, { key: 'noir', label: 'Noir', q: '"film noir" OR noir' },
  { key: 'animazione', label: 'Animazione', q: 'animation OR cartoon' }, { key: 'avventura', label: 'Avventura', q: 'adventure' },
  { key: 'azione', label: 'Azione', q: 'action' }, { key: 'giallo', label: 'Giallo e crimine', q: 'mystery OR crime' },
  { key: 'romantico', label: 'Romantico', q: 'romance' }, { key: 'guerra', label: 'Guerra', q: 'war' },
  { key: 'musical', label: 'Musical', q: 'musical' }, { key: 'documentario', label: 'Documentario', q: 'documentary' },
];

export async function iaSearch(q, genre = '') {
  const g = GENRES.find((x) => x.key === genre);
  const words = q.replace(/[^\p{L}\p{N} ]/gu, ' ').trim();
  const query = `(collection:feature_films OR collection:opensource_movies) AND mediatype:movies${g ? ` AND subject:(${g.q})` : ''}${words ? ` AND title:(${words})` : ''}`;
  const p = new URLSearchParams({ q: query, rows: '24', output: 'json' });
  ['identifier', 'title', 'year'].forEach((f) => p.append('fl[]', f));
  p.append('sort[]', 'downloads desc');
  const r = await fetch('https://archive.org/advancedsearch.php?' + p, { headers: UA });
  if (!r.ok) throw new Error('Internet Archive non raggiungibile (' + r.status + ')');
  return (await r.json()).response.docs.map((x) => ({
    id: x.identifier, title: [].concat(x.title)[0], year: x.year || null, thumb: `https://archive.org/services/img/${x.identifier}`,
  }));
}

// Sceglie il file migliore: prima gli originali (qualità massima), poi le versioni derivate
export async function iaPick(id) {
  const r = await fetch(`https://archive.org/metadata/${encodeURIComponent(id)}`, { headers: UA });
  if (!r.ok) throw new Error('Scheda non trovata');
  const d = await r.json();
  const vids = (d.files || []).filter((f) => VIDEO.test(f.name));
  const best = (a) => a.sort((x, y) => +y.size - +x.size)[0];
  const file = best(vids.filter((f) => f.source === 'original')) || best(vids.filter((f) => /h\.264|mpeg4/i.test(f.format || ''))) || best(vids);
  const y = String([].concat(d.metadata?.year || d.metadata?.date || '')[0] || '').slice(0, 4);
  return { file, title: [].concat(d.metadata?.title || id)[0], year: /^\d{4}$/.test(y) ? y : null, license: d.metadata?.licenseurl || null };
}
