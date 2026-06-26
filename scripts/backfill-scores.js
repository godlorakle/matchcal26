// Pull all WC 2026 scores from ESPN and save to scores.json.
// No API key needed. Run: node scripts/backfill-scores.js
// scores.json is the source of truth; the bot (fetch-odds.js) never overwrites it.
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
  'Congo DR':            'DR Congo',
  'DR Congo':            'DR Congo',
  'Bosnia & Herzegovina':'Bosnia & Herzegovina',
  'Bosnia-Herzegovina':  'Bosnia & Herzegovina',
  'Curacao':             'Curaçao',
  'Czech Republic':      'Czechia',
  'IR Iran':             'Iran',
  'Cape Verde Islands':  'Cape Verde',
};
function espnName(n) { return ESPN_TEAM_MAP[n] || n; }

const zlib = require('zlib');
function get(url) {
  return new Promise((resolve, reject) => {
    const opts = new URL(url);
    opts.headers = { 'Accept-Encoding': 'gzip, deflate', 'User-Agent': 'node/fetch-odds' };
    https.get(opts, res => {
      const enc = res.headers['content-encoding'] || '';
      let stream = res;
      if (enc === 'gzip') stream = res.pipe(zlib.createGunzip());
      else if (enc === 'deflate') stream = res.pipe(zlib.createInflate());
      const chunks = [];
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', () => {
        const data = Buffer.concat(chunks).toString('utf8');
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse error: ${data.slice(0,200)}`)); }
      });
      stream.on('error', reject);
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

  // Write to scores.json — separate from odds.json so the bot never wipes it.
  const scoresPath = path.join(__dirname, '..', 'scores.json');
  fs.writeFileSync(scoresPath, JSON.stringify(fresh, null, 2));
  console.log(`Saved scores.json with ${fresh.length} scores`);
}
main().catch(e => { console.error(e); process.exit(1); });
