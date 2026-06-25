// One-shot: pull all WC 2026 scores from ESPN and merge into odds.json.
// No API key needed. Run: node scripts/backfill-scores.js
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const ESPN_TEAM_MAP = {
  'United States':       'United States',
  'USA':                 'United States',
  'Korea Republic':      'South Korea',
  'South Korea':         'South Korea',
  'Turkey':              'Türkiye',
  'Turkiye':             'Türkiye',
  "Côte d'Ivoire":       'Ivory Coast',
  "Cote d'Ivoire":       'Ivory Coast',
  'Congo, DR':           'DR Congo',
  'DR Congo':            'DR Congo',
  'Bosnia & Herzegovina':'Bosnia & Herzegovina',
  'Bosnia-Herzegovina':  'Bosnia & Herzegovina',
  'Curacao':             'Curaçao',
  'Czech Republic':      'Czechia',
  'IR Iran':             'Iran',
  'Cape Verde Islands':  'Cape Verde',
};
function espnName(n) { return ESPN_TEAM_MAP[n] || n; }

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse error: ${data.slice(0,200)}`)); }
      });
    }).on('error', reject);
  });
}

async function main() {
  const fresh = [];
  const start = new Date('2026-06-11');
  const end   = new Date(); end.setDate(end.getDate() + 1);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const ds = d.toISOString().slice(0, 10).replace(/-/g, '');
    try {
      const data = await get(`https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${ds}`);
      for (const ev of (data.events || [])) {
        const comp = ev.competitions?.[0];
        if (!comp) continue;
        const homeC = comp.competitors?.find(c => c.homeAway === 'home');
        const awayC = comp.competitors?.find(c => c.homeAway === 'away');
        if (!homeC || !awayC) continue;
        const completed = !!comp.status?.type?.completed;
        const hs = parseInt(homeC.score, 10);
        const as = parseInt(awayC.score, 10);
        if (!completed || isNaN(hs) || isNaN(as)) continue;
        fresh.push({ home: espnName(homeC.team?.displayName || ''), away: espnName(awayC.team?.displayName || ''), commence: ev.date, completed: true, hs, as });
      }
    } catch (_) {}
    process.stdout.write('.');
  }
  console.log(`\nFetched ${fresh.length} completed matches from ESPN`);

  const oddsPath = path.join(__dirname, '..', 'odds.json');
  const existing = JSON.parse(fs.readFileSync(oddsPath, 'utf8'));
  const prev = (existing.scores || []).map(s => ({ ...s, hs: +s.hs, as: +s.as }));
  const key = s => `${s.home}__${s.away}__${(s.commence || '').slice(0, 10)}`;
  const map = new Map(prev.filter(s => s.completed).map(s => [key(s), s]));
  fresh.forEach(s => map.set(key(s), s));
  existing.scores = [...map.values()];
  existing.updated = new Date().toISOString();
  fs.writeFileSync(oddsPath, JSON.stringify(existing, null, 2));
  console.log(`Saved odds.json with ${existing.scores.length} scores`);
}
main().catch(e => { console.error(e); process.exit(1); });
