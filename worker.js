// ═══════════════════════════════════════════════════════════
// KuroSoftHub — Unified Cloudflare Worker
// Handles: Arb Scanner, 49ja CORS Proxy, Scores,
//          Football & NBA predictions data
//
// Deploy: Cloudflare Worker → kurosofthub.kurosoft01.workers.dev
//
// Environment variable (set in Worker Settings > Variables):
//   ODDS_API_KEY = 6f21c73af25a0d74b6397ef40f0c778b
// ═══════════════════════════════════════════════════════════

const ODDS_API_KEY = '6f21c73af25a0d74b6397ef40f0c778b';
const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';

// Sports to scan
const SPORTS = [
  { key: 'soccer_epl', name: 'Premier League', icon: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { key: 'soccer_spain_la_liga', name: 'La Liga', icon: '🇪🇸' },
  { key: 'soccer_italy_serie_a', name: 'Serie A', icon: '🇮🇹' },
  { key: 'soccer_germany_bundesliga', name: 'Bundesliga', icon: '🇩🇪' },
  { key: 'soccer_france_ligue_one', name: 'Ligue 1', icon: '🇫🇷' },
  { key: 'soccer_uefa_champs_league', name: 'Champions League', icon: '🏆' },
  { key: 'basketball_nba', name: 'NBA', icon: '🏀' },
];

const REGIONS = 'eu,uk';

// ─── In-memory caches ───
let cachedData = null;
let cacheTime = 0;
const CACHE_TTL = 600000; // 10 min

let cachedScores = null;
let scoresCacheTime = 0;
const SCORES_CACHE_TTL = 300000; // 5 min

// ─── CORS headers ───
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Target-Url',
  'Content-Type': 'application/json',
};

// ─── Helpers ───
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ═══════════════════════════════════════════════════════════
// SECTION 1: ODDS API — Fetch & Arbitrage Detection
// ═══════════════════════════════════════════════════════════

async function fetchOdds(sportKey) {
  const url = `${ODDS_API_BASE}/sports/${sportKey}/odds/?apiKey=${ODDS_API_KEY}&regions=${REGIONS}&markets=h2h&oddsFormat=decimal&includeLinks=true&includeSids=true`;
  const MAX_RETRIES = 2;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url);

      if (res.status === 429) {
        const wait = (attempt + 1) * 3000;
        console.log(`Rate limited for ${sportKey}, retry in ${wait}ms (attempt ${attempt + 1})`);
        await sleep(wait);
        continue;
      }

      if (!res.ok) {
        console.error(`Odds API error for ${sportKey}: ${res.status}`);
        return [];
      }

      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.error(`Fetch error for ${sportKey}:`, e);
      if (attempt < MAX_RETRIES) {
        await sleep(2000);
        continue;
      }
      return [];
    }
  }
  return [];
}

function detectArbitrage(games, sportName, sportIcon) {
  const opportunities = [];

  for (const game of games) {
    if (!game.bookmakers || game.bookmakers.length < 2) continue;

    const homeTeam = game.home_team;
    const awayTeam = game.away_team;
    const isThreeWay = sportName !== 'NBA';

    let bestHome = { odds: 0, bookmaker: '' };
    let bestAway = { odds: 0, bookmaker: '' };
    let bestDraw = { odds: 0, bookmaker: '' };
    const allBookmakerOdds = [];

    for (const bk of game.bookmakers) {
      const market = bk.markets?.find(m => m.key === 'h2h');
      if (!market) continue;

      const outcomes = {};
      const outcomeLinks = {};
      for (const o of market.outcomes) {
        outcomes[o.name] = o.price;
        if (o.link) outcomeLinks[o.name] = o.link;
      }

      const homeOdds = outcomes[homeTeam] || 0;
      const awayOdds = outcomes[awayTeam] || 0;
      const drawOdds = outcomes['Draw'] || 0;

      allBookmakerOdds.push({
        name: bk.title,
        key: bk.key,
        home: homeOdds,
        away: awayOdds,
        draw: drawOdds,
        lastUpdate: bk.last_update,
        link: bk.link || null,
        links: {
          home: outcomeLinks[homeTeam] || null,
          away: outcomeLinks[awayTeam] || null,
          draw: outcomeLinks['Draw'] || null,
        }
      });

      if (homeOdds > bestHome.odds) bestHome = { odds: homeOdds, bookmaker: bk.title, key: bk.key };
      if (awayOdds > bestAway.odds) bestAway = { odds: awayOdds, bookmaker: bk.title, key: bk.key };
      if (drawOdds > bestDraw.odds) bestDraw = { odds: drawOdds, bookmaker: bk.title, key: bk.key };
    }

    if (bestHome.odds <= 1 || bestAway.odds <= 1) continue;
    if (isThreeWay && bestDraw.odds <= 1) continue;

    let arbSum;
    if (isThreeWay) {
      arbSum = (1 / bestHome.odds) + (1 / bestDraw.odds) + (1 / bestAway.odds);
    } else {
      arbSum = (1 / bestHome.odds) + (1 / bestAway.odds);
    }

    const profitPct = ((1 - arbSum) * 100).toFixed(2);
    const isArb = arbSum < 1;

    const totalStake = 1000;
    let stakes;
    if (isThreeWay) {
      stakes = {
        home: { amount: +((totalStake / bestHome.odds / arbSum).toFixed(2)), bookmaker: bestHome.bookmaker, odds: bestHome.odds },
        draw: { amount: +((totalStake / bestDraw.odds / arbSum).toFixed(2)), bookmaker: bestDraw.bookmaker, odds: bestDraw.odds },
        away: { amount: +((totalStake / bestAway.odds / arbSum).toFixed(2)), bookmaker: bestAway.bookmaker, odds: bestAway.odds },
      };
    } else {
      stakes = {
        home: { amount: +((totalStake / bestHome.odds / arbSum).toFixed(2)), bookmaker: bestHome.bookmaker, odds: bestHome.odds },
        away: { amount: +((totalStake / bestAway.odds / arbSum).toFixed(2)), bookmaker: bestAway.bookmaker, odds: bestAway.odds },
      };
    }

    opportunities.push({
      sport: sportName,
      icon: sportIcon,
      homeTeam,
      awayTeam,
      commenceTime: game.commence_time,
      isArb,
      profitPct: +profitPct,
      arbSum: +arbSum.toFixed(4),
      bestOdds: {
        home: bestHome,
        draw: isThreeWay ? bestDraw : null,
        away: bestAway,
      },
      stakes,
      bookmakerCount: allBookmakerOdds.length,
      bookmakers: allBookmakerOdds,
      isThreeWay,
    });
  }

  return opportunities;
}

async function getAllOpportunities() {
  if (cachedData && Date.now() - cacheTime < CACHE_TTL) {
    return cachedData;
  }

  const allOpportunities = [];

  for (let i = 0; i < SPORTS.length; i++) {
    const sport = SPORTS[i];
    if (i > 0) await sleep(1500);
    const games = await fetchOdds(sport.key);
    const opps = detectArbitrage(games, sport.name, sport.icon);
    allOpportunities.push(...opps);
  }

  allOpportunities.sort((a, b) => {
    if (a.isArb && !b.isArb) return -1;
    if (!a.isArb && b.isArb) return 1;
    if (a.isArb && b.isArb) return b.profitPct - a.profitPct;
    return a.arbSum - b.arbSum;
  });

  const result = {
    timestamp: new Date().toISOString(),
    totalEvents: allOpportunities.length,
    arbCount: allOpportunities.filter(o => o.isArb).length,
    nearArbCount: allOpportunities.filter(o => !o.isArb && o.arbSum < 1.03).length,
    opportunities: allOpportunities,
    sports: SPORTS.map(s => s.name),
    regions: REGIONS,
  };

  cachedData = result;
  cacheTime = Date.now();
  return result;
}

// ═══════════════════════════════════════════════════════════
// SECTION 2: SCORES
// ═══════════════════════════════════════════════════════════

async function fetchScores(sportKey) {
  const url = `${ODDS_API_BASE}/sports/${sportKey}/scores/?apiKey=${ODDS_API_KEY}&daysFrom=3`;
  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 429) {
        await sleep((attempt + 1) * 3000);
        continue;
      }
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }
  return [];
}

async function getAllScores() {
  if (cachedScores && Date.now() - scoresCacheTime < SCORES_CACHE_TTL) {
    return cachedScores;
  }

  const allScores = [];
  for (let i = 0; i < SPORTS.length; i++) {
    const sport = SPORTS[i];
    if (i > 0) await sleep(1000);
    const games = await fetchScores(sport.key);
    for (const g of games) {
      if (!g.scores || !g.completed) continue;
      const homeScore = g.scores.find(s => s.name === g.home_team);
      const awayScore = g.scores.find(s => s.name === g.away_team);
      allScores.push({
        sport: sport.name,
        homeTeam: g.home_team,
        awayTeam: g.away_team,
        homeScore: homeScore ? parseInt(homeScore.score) : null,
        awayScore: awayScore ? parseInt(awayScore.score) : null,
        completed: g.completed,
        commenceTime: g.commence_time,
      });
    }
  }

  cachedScores = { timestamp: new Date().toISOString(), scores: allScores };
  scoresCacheTime = Date.now();
  return cachedScores;
}

// ═══════════════════════════════════════════════════════════
// SECTION 3: 49JA CORS PROXY
// ═══════════════════════════════════════════════════════════

const ALLOWED_PROXY_HOSTS = [
  'logigames.bet9ja.com',
  'bet9ja.com',
  'www.bet9ja.com',
  'web.bet9ja.com',
];

async function handleProxy(request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST required for /proxy' }), {
      status: 405, headers: corsHeaders,
    });
  }

  const targetUrl = request.headers.get('X-Target-Url');
  if (!targetUrl) {
    return new Response(JSON.stringify({ error: 'Missing X-Target-Url header' }), {
      status: 400, headers: corsHeaders,
    });
  }

  let targetHost;
  try {
    targetHost = new URL(targetUrl).hostname;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid target URL' }), {
      status: 400, headers: corsHeaders,
    });
  }

  if (!ALLOWED_PROXY_HOSTS.some(d => targetHost === d || targetHost.endsWith('.' + d))) {
    return new Response(JSON.stringify({ error: 'Domain not allowed: ' + targetHost }), {
      status: 403, headers: corsHeaders,
    });
  }

  try {
    const body = await request.text();
    const proxyRes = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Origin': 'https://bet9ja.com',
        'Referer': 'https://bet9ja.com/',
      },
      body,
    });

    const data = await proxyRes.text();
    return new Response(data, {
      status: proxyRes.status,
      headers: {
        ...corsHeaders,
        'Content-Type': proxyRes.headers.get('Content-Type') || 'application/json',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({
      error: 'Proxy fetch failed',
      message: err.message,
      targetUrl,
    }), {
      status: 502, headers: corsHeaders,
    });
  }
}

// ═══════════════════════════════════════════════════════════
// SECTION 4: REQUEST HANDLER
// ═══════════════════════════════════════════════════════════

export default {
  async fetch(request) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {

      // ── Arb Scanner: All opportunities ──
      if (path === '/' || path === '/api/arb') {
        const data = await getAllOpportunities();
        return new Response(JSON.stringify(data), { headers: corsHeaders });
      }

      // ── Arb Scanner: Only arb/near-arb ──
      if (path === '/api/arbs-only') {
        const data = await getAllOpportunities();
        const filtered = {
          ...data,
          opportunities: data.opportunities.filter(o => o.isArb || o.arbSum < 1.02),
        };
        filtered.totalEvents = filtered.opportunities.length;
        return new Response(JSON.stringify(filtered), { headers: corsHeaders });
      }

      // ── Filter by sport ──
      if (path.startsWith('/api/sport/')) {
        const sportFilter = decodeURIComponent(path.replace('/api/sport/', ''));
        const data = await getAllOpportunities();
        const filtered = {
          ...data,
          opportunities: data.opportunities.filter(o =>
            o.sport.toLowerCase().includes(sportFilter.toLowerCase())
          ),
        };
        filtered.totalEvents = filtered.opportunities.length;
        filtered.arbCount = filtered.opportunities.filter(o => o.isArb).length;
        return new Response(JSON.stringify(filtered), { headers: corsHeaders });
      }

      // ── Scores ──
      if (path === '/api/scores') {
        const scores = await getAllScores();
        return new Response(JSON.stringify(scores), { headers: corsHeaders });
      }

      // ── 49ja CORS Proxy ──
      if (path === '/proxy') {
        return await handleProxy(request);
      }

      // ── Health check ──
      if (path === '/health') {
        return new Response(JSON.stringify({
          status: 'ok',
          worker: 'royal-term-064dkurosofthub',
          cached: !!cachedData,
          cacheAge: cachedData ? Math.round((Date.now() - cacheTime) / 1000) + 's' : null,
          scoresCached: !!cachedScores,
          scoresCacheAge: cachedScores ? Math.round((Date.now() - scoresCacheTime) / 1000) + 's' : null,
          sports: SPORTS.length,
          endpoints: [
            'GET  /              — All arb opportunities (football + NBA)',
            'GET  /api/arb       — Same as /',
            'GET  /api/arbs-only — Only arb & near-arb opps',
            'GET  /api/sport/:n  — Filter by sport name',
            'GET  /api/scores    — Completed match scores (3 days)',
            'POST /proxy         — 49ja CORS proxy (set X-Target-Url header)',
            'GET  /health        — This health check',
          ],
        }), { headers: corsHeaders });
      }

      // ── 404 ──
      return new Response(JSON.stringify({
        error: 'Not found',
        hint: 'Visit /health for available endpoints',
      }), { status: 404, headers: corsHeaders });

    } catch (err) {
      return new Response(JSON.stringify({
        error: 'Internal error',
        message: err.message,
      }), { status: 500, headers: corsHeaders });
    }
  }
};
