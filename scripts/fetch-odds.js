// fetch-odds.js — runs in GitHub Actions every 2h
// Fetches World Cup odds from The Odds API and saves to odds.json

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const API_KEY = process.env.ODDS_API_KEY;
if (!API_KEY) { console.error('Missing ODDS_API_KEY'); process.exit(1); }

// Normalize team names from Odds API → our fixture names
const TEAM_MAP = {
  'United States':      'United States',
  'USA':                'United States',
  'Korea Republic':     'South Korea',
  'Republic of Korea':  'South Korea',
  'Turkey':             'Türkiye',
  'Turkiye':            'Türkiye',
  "Cote d'Ivoire":      'Ivory Coast',
  "Côte d'Ivoire":      'Ivory Coast',
  'Congo DR':           'DR Congo',
  'Democratic Republic of Congo': 'DR Congo',
  'Bosnia-Herzegovina': 'Bosnia & Herzegovina',
  'Bosnia and Herzegovina': 'Bosnia & Herzegovina',
  'Curacao':            'Curaçao',
  'Czech Republic':     'Czechia',
  'Czechia':            'Czechia',
  'Cape Verde Islands': 'Cape Verde',
  'Iran':               'Iran',
  'IR Iran':            'Iran',
  'New Zealand':        'New Zealand',
  'England':            'England',
  'Scotland':           'Scotland',
};

function normalize(name) {
  return TEAM_MAP[name] || name;
}

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
  console.log('Fetching available sports…');

  // Find the active World Cup sport key
  const sports = await get(`https://api.the-odds-api.com/v4/sports/?apiKey=${API_KEY}`);

  if (!Array.isArray(sports)) {
    console.error('Unexpected response from sports endpoint:', sports);
    process.exit(1);
  }

  const wcSport = sports.find(s =>
    s.active && (
      s.key.includes('world_cup') ||
      s.key.includes('fifa') ||
      (s.key.includes('soccer') && s.title?.toLowerCase().includes('world cup'))
    )
  );

  if (!wcSport) {
    console.log('World Cup not listed as active sport yet — saving empty odds.');
    saveOdds([]);
    return;
  }

  console.log(`Found sport: ${wcSport.key} — "${wcSport.title}"`);

  // Fetch h2h (1X2) odds, EU bookmakers, decimal format
  const url = `https://api.the-odds-api.com/v4/sports/${wcSport.key}/odds/` +
    `?apiKey=${API_KEY}&regions=eu&markets=h2h&oddsFormat=decimal&dateFormat=iso`;

  const raw = await get(url);

  if (!Array.isArray(raw)) {
    console.error('Unexpected odds response:', raw);
    saveOdds([]);
    return;
  }

  console.log(`Got ${raw.length} matches from API`);

  // Top bookmakers to show (in preference order)
  const PREFERRED_BOOKS = [
    'Unibet', 'bet365', 'William Hill', 'Betfair',
    'Pinnacle', 'Betway', 'Bwin', 'Marathon Bet',
  ];

  const matches = raw.map(match => {
    const home = normalize(match.home_team);
    const away = normalize(match.away_team);

    // Sort bookmakers by preference
    const books = [...match.bookmakers].sort((a, b) => {
      const ai = PREFERRED_BOOKS.indexOf(a.title);
      const bi = PREFERRED_BOOKS.indexOf(b.title);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    }).slice(0, 3); // keep top 3

    const formatted = books.map(b => {
      const mkt = b.markets?.find(m => m.key === 'h2h');
      if (!mkt) return null;
      return {
        name: b.title,
        home: mkt.outcomes.find(o => o.name === match.home_team)?.price ?? null,
        draw: mkt.outcomes.find(o => o.name === 'Draw')?.price ?? null,
        away: mkt.outcomes.find(o => o.name === match.away_team)?.price ?? null,
      };
    }).filter(Boolean);

    return { home, away, commence: match.commence_time, books: formatted };
  });

  // ── Outright "winner" market: each team's odds to win the tournament ──
  let winner = {};
  try {
    const winnerSport = sports.find(s => s.active && /winner|outright/i.test(s.key) &&
      (s.key.includes('world_cup') || s.title?.toLowerCase().includes('world cup')));
    if (winnerSport) {
      console.log(`Found outright market: ${winnerSport.key}`);
      const wUrl = `https://api.the-odds-api.com/v4/sports/${winnerSport.key}/odds/` +
        `?apiKey=${API_KEY}&regions=eu&markets=outrights&oddsFormat=decimal`;
      const wRaw = await get(wUrl);
      if (Array.isArray(wRaw) && wRaw.length) {
        // pick the preferred bookmaker that has outrights
        const evt = wRaw[0];
        const book = [...(evt.bookmakers || [])].sort((a, b) => {
          const ai = PREFERRED_BOOKS.indexOf(a.title), bi = PREFERRED_BOOKS.indexOf(b.title);
          return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        })[0];
        const mkt = book?.markets?.find(m => m.key === 'outrights');
        if (mkt) {
          mkt.outcomes.forEach(o => { winner[normalize(o.name)] = o.price; });
          console.log(`Got outright odds for ${Object.keys(winner).length} teams from ${book.title}`);
        }
      }
    } else {
      console.log('No outright winner market listed yet.');
    }
  } catch (e) { console.log('Outright fetch skipped:', e.message); }

  // ── Scores: live + recently completed matches (same key, /scores endpoint) ──
  let scores = [];
  try {
    const sUrl = `https://api.the-odds-api.com/v4/sports/${wcSport.key}/scores/` +
      `?apiKey=${API_KEY}&daysFrom=3&dateFormat=iso`;
    const sRaw = await get(sUrl);
    if (Array.isArray(sRaw)) {
      scores = sRaw.filter(g => Array.isArray(g.scores)).map(g => {
        const home = normalize(g.home_team), away = normalize(g.away_team);
        const find = n => g.scores.find(s => normalize(s.name) === n)?.score;
        const hs = find(home), as = find(away);
        return { home, away, commence: g.commence_time, completed: !!g.completed, hs, as };
      }).filter(s => s.hs != null && s.as != null);
      console.log(`Got scores for ${scores.length} matches (live + completed)`);
    }
  } catch (e) { console.log('Scores fetch skipped:', e.message); }

  saveOdds(matches, winner, scores);
}

function saveOdds(matches, winner = {}, scores = []) {
  const out = {
    updated: new Date().toISOString(),
    matches,
    winner,
    scores,
  };
  const outPath = path.join(__dirname, '..', 'odds.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`Saved odds.json — ${matches.length} matches, ${Object.keys(winner).length} outright teams, ${new Date().toISOString()}`);
}

main().catch(err => {
  console.error('fetch-odds failed:', err);
  process.exit(1);
});
