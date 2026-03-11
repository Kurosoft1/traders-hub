// ═══════════════════════════════════════════════════════════
// BetLab Pro — Lottery Intelligence Engine
// Covers 10+ global lotteries with statistical analysis,
// Bayesian predictions, and continuous learning
// ═══════════════════════════════════════════════════════════

const LOTTERIES = {
  'uk49s_lunch': {
    name: 'UK 49s Lunchtime', icon: '🇬🇧', pool: 49, draw: 6, bonus: 1,
    schedule: 'Daily 12:49 PM GMT',
    api: 'https://www.lottery.co.uk/lunchtime/results/archive',
  },
  'uk49s_tea': {
    name: 'UK 49s Teatime', icon: '🇬🇧', pool: 49, draw: 6, bonus: 1,
    schedule: 'Daily 5:49 PM GMT',
  },
  'ghana_monday': { name: 'Ghana Monday Special', icon: '🇬🇭', pool: 90, draw: 5, bonus: 0, schedule: 'Monday' },
  'ghana_tuesday': { name: 'Ghana Lucky Tuesday', icon: '🇬🇭', pool: 90, draw: 5, bonus: 0, schedule: 'Tuesday' },
  'ghana_midweek': { name: 'Ghana Midweek', icon: '🇬🇭', pool: 90, draw: 5, bonus: 0, schedule: 'Wednesday' },
  'ghana_thursday': { name: 'Ghana Fortune Thursday', icon: '🇬🇭', pool: 90, draw: 5, bonus: 0, schedule: 'Thursday' },
  'ghana_friday': { name: 'Ghana Friday Bonanza', icon: '🇬🇭', pool: 90, draw: 5, bonus: 0, schedule: 'Friday' },
  'ghana_saturday': { name: 'Ghana National Saturday', icon: '🇬🇭', pool: 90, draw: 5, bonus: 0, schedule: 'Saturday' },
  'us_powerball': {
    name: 'US Powerball', icon: '🇺🇸', pool: 69, draw: 5, bonusPool: 26, bonus: 1,
    schedule: 'Mon, Wed, Sat',
  },
  'us_mega': {
    name: 'US Mega Millions', icon: '🇺🇸', pool: 70, draw: 5, bonusPool: 25, bonus: 1,
    schedule: 'Tue, Fri',
  },
  'euromillions': {
    name: 'EuroMillions', icon: '🇪🇺', pool: 50, draw: 5, bonusPool: 12, bonus: 2,
    schedule: 'Tue, Fri',
  },
  'china_ssq': {
    name: 'China Welfare (双色球)', icon: '🇨🇳', pool: 33, draw: 6, bonusPool: 16, bonus: 1,
    schedule: 'Tue, Thu, Sun',
  },
  'china_3d': {
    name: 'China Welfare 3D (福彩3D)', icon: '🇨🇳', pool: 9, draw: 3, bonus: 0,
    schedule: 'Daily',
    isDigit: true, // Each position 0-9 independently
  },
  'sa_powerball': {
    name: 'SA Powerball', icon: '🇿🇦', pool: 50, draw: 5, bonusPool: 20, bonus: 1,
    schedule: 'Tue, Fri',
  },
  'nigeria_lotto': {
    name: 'Nigeria Lotto (5/90)', icon: '🇳🇬', pool: 90, draw: 5, bonus: 0,
    schedule: 'Daily',
  },
  'bet9ja_49': {
    name: 'Bet9ja 49 Balls', icon: '🎱', pool: 49, draw: 6, bonus: 0,
    schedule: 'Every 5 min (virtual)',
  },
};

// ═══════════════════════════════════════════════════════════
// STORAGE — Persist results & predictions in localStorage
// ═══════════════════════════════════════════════════════════

function getLotteryResults(lotteryId) {
  try { return JSON.parse(localStorage.getItem(`lottery_results_${lotteryId}`) || '[]'); } catch { return []; }
}
function saveLotteryResults(lotteryId, results) {
  localStorage.setItem(`lottery_results_${lotteryId}`, JSON.stringify(results));
}
function getLotteryPredictions(lotteryId) {
  try { return JSON.parse(localStorage.getItem(`lottery_preds_${lotteryId}`) || '[]'); } catch { return []; }
}
function saveLotteryPredictions(lotteryId, preds) {
  localStorage.setItem(`lottery_preds_${lotteryId}`, JSON.stringify(preds));
}
function getModelWeights(lotteryId) {
  try { return JSON.parse(localStorage.getItem(`lottery_weights_${lotteryId}`) || 'null'); } catch { return null; }
}
function saveModelWeights(lotteryId, weights) {
  localStorage.setItem(`lottery_weights_${lotteryId}`, JSON.stringify(weights));
}

// ═══════════════════════════════════════════════════════════
// ANALYSIS ENGINE — Statistical models for number prediction
// ═══════════════════════════════════════════════════════════

class LotteryAnalyzer {
  constructor(lotteryId) {
    this.id = lotteryId;
    this.config = LOTTERIES[lotteryId];
    this.results = getLotteryResults(lotteryId);
    this.predictions = getLotteryPredictions(lotteryId);
    
    // Model weights — start equal, learn over time
    this.weights = getModelWeights(lotteryId) || {
      frequency: 0.20,
      bayesian: 0.25,
      markov: 0.15,
      gap: 0.20,
      cluster: 0.10,
      regression: 0.10,
    };
  }

  // ── 1. FREQUENCY ANALYSIS ──
  // How often each number appears vs expected
  frequencyAnalysis() {
    const { pool, draw } = this.config;
    const counts = new Array(pool + 1).fill(0);
    const total = this.results.length;
    
    this.results.forEach(r => {
      r.numbers.forEach(n => { if (n >= 1 && n <= pool) counts[n]++; });
    });

    const expected = total * (draw / pool);
    const analysis = [];
    
    for (let n = 1; n <= pool; n++) {
      const freq = counts[n];
      const deviation = freq - expected;
      const zScore = expected > 0 ? deviation / Math.sqrt(expected * (1 - draw / pool)) : 0;
      
      analysis.push({
        number: n,
        frequency: freq,
        expected: Math.round(expected * 100) / 100,
        deviation: Math.round(deviation * 100) / 100,
        zScore: Math.round(zScore * 100) / 100,
        isHot: zScore > 1.5,
        isCold: zScore < -1.5,
        // Score: numbers close to expected but slightly under get higher scores
        // (regression to mean suggests they're "due")
        score: Math.max(0, (expected - freq) / Math.max(expected, 1)) * 50 + (freq / Math.max(total, 1)) * 50,
      });
    }
    
    return analysis.sort((a, b) => b.score - a.score);
  }

  // ── 2. BAYESIAN PROBABILITY ──
  // Start with uniform prior, update with each draw observation
  bayesianAnalysis() {
    const { pool, draw } = this.config;
    // Prior: each number equally likely
    const prior = new Array(pool + 1).fill(1 / pool);
    const posteriors = [...prior];
    
    // Learning rate decays with more data
    const alpha = Math.max(0.01, 1 / Math.max(this.results.length, 1));
    
    // Update posteriors with each draw (more recent draws weighted higher)
    this.results.forEach((r, idx) => {
      const recency = Math.exp(-idx * 0.02); // Exponential decay
      r.numbers.forEach(n => {
        if (n >= 1 && n <= pool) {
          posteriors[n] += alpha * recency;
        }
      });
    });

    // Normalize
    const sum = posteriors.reduce((a, b) => a + b, 0);
    const normalized = posteriors.map(p => p / sum);
    
    return normalized.map((prob, n) => ({
      number: n,
      probability: Math.round(prob * 10000) / 10000,
      score: prob * 1000,
    })).slice(1); // Skip index 0
  }

  // ── 3. MARKOV CHAIN TRANSITIONS ──
  // Which numbers tend to appear after which numbers
  markovAnalysis() {
    const { pool } = this.config;
    // Transition matrix: probability of number B appearing in draw after number A
    const transitions = {};
    
    for (let i = 0; i < this.results.length - 1; i++) {
      const current = this.results[i].numbers;
      const next = this.results[i + 1].numbers;
      
      current.forEach(a => {
        if (!transitions[a]) transitions[a] = new Array(pool + 1).fill(0);
        next.forEach(b => { transitions[a][b]++; });
      });
    }

    // If we have a most recent draw, find which numbers are likely next
    if (this.results.length === 0) return [];
    
    const lastDraw = this.results[0].numbers;
    const scores = new Array(pool + 1).fill(0);
    
    lastDraw.forEach(a => {
      if (transitions[a]) {
        const total = transitions[a].reduce((s, v) => s + v, 0);
        if (total > 0) {
          transitions[a].forEach((count, b) => {
            scores[b] += count / total;
          });
        }
      }
    });

    return scores.map((score, n) => ({ number: n, score })).slice(1);
  }

  // ── 4. GAP ANALYSIS ──
  // How long since each number was drawn (regression to mean)
  gapAnalysis() {
    const { pool } = this.config;
    const lastSeen = new Array(pool + 1).fill(Infinity);
    
    this.results.forEach((r, idx) => {
      r.numbers.forEach(n => {
        if (n >= 1 && n <= pool && lastSeen[n] === Infinity) {
          lastSeen[n] = idx;
        }
      });
    });

    // Average gap for the lottery
    const { draw } = this.config;
    const expectedGap = pool / draw;
    
    return Array.from({ length: pool }, (_, i) => {
      const n = i + 1;
      const gap = lastSeen[n] === Infinity ? this.results.length : lastSeen[n];
      const overdue = gap / expectedGap;
      return {
        number: n,
        gap,
        expectedGap: Math.round(expectedGap * 10) / 10,
        overdue: Math.round(overdue * 100) / 100,
        // Higher score for more overdue numbers
        score: Math.min(overdue * 30, 100),
      };
    });
  }

  // ── 5. CLUSTER ANALYSIS ──
  // Which numbers tend to appear together
  clusterAnalysis() {
    const { pool } = this.config;
    const pairCounts = {};
    
    this.results.forEach(r => {
      const nums = r.numbers.filter(n => n >= 1 && n <= pool);
      for (let i = 0; i < nums.length; i++) {
        for (let j = i + 1; j < nums.length; j++) {
          const key = `${Math.min(nums[i], nums[j])}-${Math.max(nums[i], nums[j])}`;
          pairCounts[key] = (pairCounts[key] || 0) + 1;
        }
      }
    });

    // Find top pairs
    const pairs = Object.entries(pairCounts)
      .map(([key, count]) => ({ pair: key.split('-').map(Number), count }))
      .sort((a, b) => b.count - a.count);

    // Score: numbers that appear in frequent pairs get bonus
    const scores = new Array(pool + 1).fill(0);
    pairs.slice(0, 50).forEach(p => {
      p.pair.forEach(n => { scores[n] += p.count; });
    });

    const maxScore = Math.max(...scores, 1);
    return scores.map((s, n) => ({ number: n, score: (s / maxScore) * 100, topPairs: pairs.filter(p => p.pair.includes(n)).slice(0, 3) })).slice(1);
  }

  // ── 6. REGRESSION TO MEAN ──
  // Numbers that have deviated significantly from expected should revert
  regressionAnalysis() {
    const freq = this.frequencyAnalysis();
    return freq.map(f => ({
      number: f.number,
      score: f.isCold ? 80 + Math.abs(f.zScore) * 10 : f.isHot ? 20 - f.zScore * 5 : 50,
    }));
  }

  // ═══════════════════════════════════════════════════════════
  // COMBINED PREDICTION — Weighted ensemble of all models
  // ═══════════════════════════════════════════════════════════

  generatePrediction() {
    if (this.results.length < 5) {
      return { error: 'Need at least 5 past results for prediction', numbers: [] };
    }

    const { pool, draw } = this.config;
    const w = this.weights;

    // Run all models
    const freqScores = this.frequencyAnalysis();
    const bayesScores = this.bayesianAnalysis();
    const markovScores = this.markovAnalysis();
    const gapScores = this.gapAnalysis();
    const clusterScores = this.clusterAnalysis();
    const regressionScores = this.regressionAnalysis();

    // Combine scores
    const combined = [];
    for (let n = 1; n <= pool; n++) {
      const fScore = (freqScores.find(f => f.number === n)?.score || 0) * w.frequency;
      const bScore = (bayesScores.find(f => f.number === n)?.score || 0) * w.bayesian;
      const mScore = (markovScores.find(f => f.number === n)?.score || 0) * w.markov;
      const gScore = (gapScores.find(f => f.number === n)?.score || 0) * w.gap;
      const cScore = (clusterScores.find(f => f.number === n)?.score || 0) * w.cluster;
      const rScore = (regressionScores.find(f => f.number === n)?.score || 0) * w.regression;

      combined.push({
        number: n,
        totalScore: fScore + bScore + mScore + gScore + cScore + rScore,
        breakdown: { frequency: fScore, bayesian: bScore, markov: mScore, gap: gScore, cluster: cScore, regression: rScore },
      });
    }

    // Sort by total score descending
    combined.sort((a, b) => b.totalScore - a.totalScore);

    // Pick top N numbers with some randomness to avoid always picking the same
    // Use softmax-style selection for diversity
    const topPool = combined.slice(0, Math.min(draw * 3, pool));
    const selected = [];
    const available = [...topPool];

    for (let i = 0; i < draw && available.length > 0; i++) {
      // Softmax selection
      const maxScore = Math.max(...available.map(a => a.totalScore));
      const expScores = available.map(a => Math.exp((a.totalScore - maxScore) / 5));
      const sumExp = expScores.reduce((a, b) => a + b, 0);
      const probs = expScores.map(e => e / sumExp);
      
      // Weighted random selection
      let rand = Math.random();
      let cumProb = 0;
      let chosenIdx = 0;
      for (let j = 0; j < probs.length; j++) {
        cumProb += probs[j];
        if (rand <= cumProb) { chosenIdx = j; break; }
      }
      
      selected.push(available[chosenIdx]);
      available.splice(chosenIdx, 1);
    }

    // Sort selected numbers
    selected.sort((a, b) => a.number - b.number);

    // Generate bonus number if applicable
    let bonusNumber = null;
    if (this.config.bonus > 0) {
      const bonusPool = this.config.bonusPool || pool;
      bonusNumber = Math.floor(Math.random() * bonusPool) + 1;
    }

    const prediction = {
      id: Date.now().toString(),
      lotteryId: this.id,
      lotteryName: this.config.name,
      numbers: selected.map(s => s.number),
      bonusNumber,
      confidence: this.calculateConfidence(selected),
      breakdown: selected.map(s => s.breakdown),
      timestamp: new Date().toISOString(),
      date: new Date().toLocaleDateString('en-GB'),
      dateKey: new Date().toISOString().slice(0, 10),
      status: 'pending', // pending, hit, partial, miss
      matchedNumbers: [],
      modelWeights: { ...this.weights },
      basedOn: this.results.length + ' past draws',
    };

    // Save prediction
    const preds = this.predictions;
    preds.unshift(prediction);
    if (preds.length > 200) preds.length = 200;
    saveLotteryPredictions(this.id, preds);
    this.predictions = preds;

    return prediction;
  }

  calculateConfidence(selected) {
    if (this.results.length < 20) return 'LOW';
    const avgScore = selected.reduce((a, s) => a + s.totalScore, 0) / selected.length;
    if (avgScore > 60) return 'HIGH';
    if (avgScore > 40) return 'MODERATE';
    return 'LOW';
  }

  // ═══════════════════════════════════════════════════════════
  // CONTINUOUS LEARNING — Compare predictions vs actual results
  // ═══════════════════════════════════════════════════════════

  evaluatePredictions(actualDraw) {
    // Check all pending predictions against this actual draw
    const preds = getLotteryPredictions(this.id);
    let changed = false;

    preds.forEach(pred => {
      if (pred.status !== 'pending') return;
      
      const matched = pred.numbers.filter(n => actualDraw.numbers.includes(n));
      pred.matchedNumbers = matched;
      
      const matchRate = matched.length / pred.numbers.length;
      if (matchRate >= 0.8) pred.status = 'hit';
      else if (matchRate >= 0.3) pred.status = 'partial';
      else pred.status = 'miss';
      
      changed = true;
    });

    if (changed) {
      saveLotteryPredictions(this.id, preds);
      this.predictions = preds;
      this.updateModelWeights();
    }
  }

  updateModelWeights() {
    // Analyze which models contributed most to successful predictions
    const evaluated = this.predictions.filter(p => p.status !== 'pending' && p.breakdown);
    if (evaluated.length < 10) return; // Need enough data to learn

    const modelPerformance = {
      frequency: 0, bayesian: 0, markov: 0, gap: 0, cluster: 0, regression: 0,
    };

    evaluated.forEach(pred => {
      const isGood = pred.status === 'hit' || pred.status === 'partial';
      const multiplier = isGood ? 1 : -0.5;
      
      if (pred.breakdown && pred.breakdown[0]) {
        // Average breakdown across selected numbers
        const avgBreakdown = {};
        Object.keys(modelPerformance).forEach(key => {
          avgBreakdown[key] = pred.breakdown.reduce((sum, b) => sum + (b[key] || 0), 0) / pred.breakdown.length;
        });
        
        Object.keys(modelPerformance).forEach(key => {
          modelPerformance[key] += (avgBreakdown[key] || 0) * multiplier;
        });
      }
    });

    // Normalize to weights that sum to 1
    const total = Object.values(modelPerformance).reduce((a, b) => a + Math.max(b, 0.01), 0);
    const newWeights = {};
    Object.keys(modelPerformance).forEach(key => {
      newWeights[key] = Math.max(modelPerformance[key], 0.01) / total;
    });

    // Smooth update (don't change weights too drastically)
    const smoothing = 0.3;
    Object.keys(this.weights).forEach(key => {
      this.weights[key] = this.weights[key] * (1 - smoothing) + (newWeights[key] || 0.1) * smoothing;
    });

    // Re-normalize
    const wTotal = Object.values(this.weights).reduce((a, b) => a + b, 0);
    Object.keys(this.weights).forEach(key => { this.weights[key] /= wTotal; });

    saveModelWeights(this.id, this.weights);
  }

  // ═══════════════════════════════════════════════════════════
  // STATISTICS — Comprehensive data for users
  // ═══════════════════════════════════════════════════════════

  getFullStats() {
    const freq = this.frequencyAnalysis();
    const gaps = this.gapAnalysis();
    const clusters = this.clusterAnalysis();
    const bayesian = this.bayesianAnalysis();

    // Prediction history stats
    const preds = this.predictions.filter(p => p.status !== 'pending');
    const hits = preds.filter(p => p.status === 'hit').length;
    const partials = preds.filter(p => p.status === 'partial').length;
    const misses = preds.filter(p => p.status === 'miss').length;

    // Number-by-number stats
    const numberStats = freq.map(f => {
      const gap = gaps.find(g => g.number === f.number);
      const cluster = clusters.find(c => c.number === f.number);
      const bayes = bayesian.find(b => b.number === f.number);
      return {
        number: f.number,
        frequency: f.frequency,
        expected: f.expected,
        deviation: f.deviation,
        zScore: f.zScore,
        isHot: f.isHot,
        isCold: f.isCold,
        gap: gap?.gap || 0,
        overdue: gap?.overdue || 0,
        probability: bayes?.probability || 0,
        clusterScore: cluster?.score || 0,
        topPairs: cluster?.topPairs?.map(p => p.pair) || [],
      };
    });

    return {
      lotteryId: this.id,
      lotteryName: this.config.name,
      totalDraws: this.results.length,
      numberStats: numberStats.sort((a, b) => a.number - b.number),
      hotNumbers: freq.filter(f => f.isHot).map(f => f.number),
      coldNumbers: freq.filter(f => f.isCold).map(f => f.number),
      overdueNumbers: gaps.filter(g => g.overdue > 1.5).sort((a, b) => b.overdue - a.overdue).map(g => g.number),
      topPairs: clusters[0]?.topPairs?.slice(0, 10) || [],
      predictionRecord: { hits, partials, misses, total: preds.length, hitRate: preds.length > 0 ? ((hits / preds.length) * 100).toFixed(1) : '0' },
      modelWeights: this.weights,
      lastDraw: this.results[0] || null,
      last10: this.results.slice(0, 10),
    };
  }

  // Add a historical result
  addResult(draw) {
    // draw = { numbers: [1,2,3,...], bonus?: 7, date: '2026-03-10', drawId?: '123' }
    this.results.unshift(draw);
    if (this.results.length > 1000) this.results.length = 1000;
    saveLotteryResults(this.id, this.results);
    
    // Auto-evaluate pending predictions
    this.evaluatePredictions(draw);
  }
}

// Export for use in the website
if (typeof window !== 'undefined') {
  window.LOTTERIES = LOTTERIES;
  window.LotteryAnalyzer = LotteryAnalyzer;
  window.getLotteryResults = getLotteryResults;
  window.saveLotteryResults = saveLotteryResults;
  window.getLotteryPredictions = getLotteryPredictions;
}
