// Half-life of 30 days: score decays to 50% after 30 days
const HALF_LIFE_DAYS = 30;
const LAMBDA = Math.LN2 / HALF_LIFE_DAYS;

export function decayWeight(timestampIso) {
  try {
    const daysAgo = (Date.now() - new Date(timestampIso).getTime()) / 86400000;
    return Math.exp(-LAMBDA * Math.max(0, daysAgo));
  } catch {
    return 0;
  }
}

export function weightedScore(records) {
  let total = 0;
  for (const r of records) {
    const weight = decayWeight(r.timestamp);
    total += (r.score ?? 0) * weight;
  }
  return total;
}

/**
 * Takes an array of tool call records and returns the top N tool names
 * with the worst (most negative) time-weighted cumulative scores.
 * Only returns tools with a negative weighted score.
 */
export function topFailedTools(records, limit = 5) {
  const byTool = {};

  for (const r of records) {
    const name = r.tool_name ?? 'unknown';
    if (!byTool[name]) byTool[name] = [];
    byTool[name].push(r);
  }

  const scored = Object.entries(byTool).map(([name, recs]) => {
    const wScore = weightedScore(recs);
    const failures = recs.filter(r => r.success === 'false');
    const lastFailure = failures
      .sort((a, b) => (b.timestamp ?? '').localeCompare(a.timestamp ?? ''))
      [0];

    return {
      tool_name: name,
      weighted_score: Math.round(wScore * 10) / 10,
      failure_count: failures.length,
      total_count: recs.length,
      last_error: lastFailure?.error ?? '',
      last_summary: lastFailure?.summary ?? '',
    };
  });

  return scored
    .filter(s => s.weighted_score < 0)
    .sort((a, b) => a.weighted_score - b.weighted_score)
    .slice(0, limit);
}
