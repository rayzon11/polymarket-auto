import {
  AgentDecision,
  AgentSignal,
  ConsensusResult,
  PolyMarket,
  PolyOrderBook,
  BotPosition,
  BotConfig,
} from '@/lib/agents/types';

// Consensus Engine — The Core Win-Rate Booster
// ALL 8 rules must pass for a trade to execute.
// This is why the system targets 90%+ win rate:
// we only trade when every signal strongly agrees.

export function evaluateConsensus(
  decisions: AgentDecision[],
  market: PolyMarket,
  orderbook: PolyOrderBook,
  openPositions: BotPosition[],
  config: BotConfig,
): ConsensusResult {
  const timestamp = new Date().toISOString();
  const reasons: string[] = [];
  const ruleResults: Record<string, boolean> = {};

  // Count signals by direction
  const buyYes = decisions.filter((d) => d.signal === 'BUY_YES');
  const buyNo = decisions.filter((d) => d.signal === 'BUY_NO');
  const holds = decisions.filter((d) => d.signal === 'HOLD');

  const majoritySignal: AgentSignal = buyYes.length >= buyNo.length ? 'BUY_YES' : 'BUY_NO';
  const agreeCount = majoritySignal === 'BUY_YES' ? buyYes.length : buyNo.length;
  const agreeingDecisions = majoritySignal === 'BUY_YES' ? buyYes : buyNo;
  const avgConfidence = agreeingDecisions.length > 0
    ? agreeingDecisions.reduce((s, d) => s + d.confidence, 0) / agreeingDecisions.length
    : 0;
  const avgEdge = agreeingDecisions.length > 0
    ? agreeingDecisions.reduce((s, d) => s + d.edge, 0) / agreeingDecisions.length
    : 0;

  // Oracle decision
  const oracleDecision = decisions.find((d) => d.agent === 'oracle');

  // --- RULE 1: At least 4 of 5 agents must agree on direction ---
  const rule1 = agreeCount >= config.bot.minConsensusAgents;
  ruleResults['supermajority'] = rule1;
  if (!rule1) reasons.push(`Only ${agreeCount}/${decisions.length} agents agree (need ${config.bot.minConsensusAgents})`);

  // --- RULE 2: Average confidence > 0.65 ---
  const rule2 = avgConfidence > 0.65;
  ruleResults['confidence_threshold'] = rule2;
  if (!rule2) reasons.push(`Avg confidence ${avgConfidence.toFixed(3)} below 0.65`);

  // --- RULE 3: Oracle must NOT output HOLD or LOW confidence ---
  const rule3 = oracleDecision
    ? oracleDecision.signal !== 'HOLD' && oracleDecision.confidence >= 0.50
    : false;
  ruleResults['oracle_check'] = rule3;
  if (!rule3) {
    if (!oracleDecision) reasons.push('Oracle decision missing');
    else if (oracleDecision.signal === 'HOLD') reasons.push('Oracle says HOLD');
    else reasons.push(`Oracle confidence too low (${oracleDecision.confidence.toFixed(2)})`);
  }

  // --- RULE 4: Edge > 0.07 (7 cents minimum) ---
  const rule4 = avgEdge > config.bot.minEdge;
  ruleResults['edge_requirement'] = rule4;
  if (!rule4) reasons.push(`Avg edge ${avgEdge.toFixed(4)} below ${config.bot.minEdge}`);

  // --- RULE 5: Market passed filter (assumed if we got here, but double-check) ---
  const rule5 = market.active && !market.closed && market.volume >= config.bot.minMarketVolume;
  ruleResults['market_filter'] = rule5;
  if (!rule5) reasons.push('Market does not pass basic filter');

  // --- RULE 6: Portfolio constraints ---
  const currentExposure = openPositions.reduce((sum, p) => sum + p.costBasis, 0);
  const maxExposure = config.bot.maxExposure * config.bot.bankroll;
  const sameCategory = openPositions.filter((p) => p.category === market.category);
  const sameMarket = openPositions.filter((p) => p.marketId === market.conditionId);

  const rule6 = currentExposure < maxExposure
    && sameCategory.length < 2
    && sameMarket.length === 0;
  ruleResults['portfolio_constraints'] = rule6;
  if (!rule6) {
    if (currentExposure >= maxExposure) reasons.push(`Exposure $${currentExposure.toFixed(0)} >= max $${maxExposure.toFixed(0)}`);
    if (sameCategory.length >= 2) reasons.push(`Already ${sameCategory.length} positions in "${market.category}"`);
    if (sameMarket.length > 0) reasons.push(`Already have position in this market`);
  }

  // --- RULE 7: No entry in last 6 hours before resolution ---
  const hoursUntilResolution = (new Date(market.endDate).getTime() - Date.now()) / (1000 * 60 * 60);
  const rule7 = hoursUntilResolution > 6;
  ruleResults['time_filter'] = rule7;
  if (!rule7) reasons.push(`Only ${hoursUntilResolution.toFixed(1)}h until resolution (min 6h)`);

  // --- RULE 8: Momentum confirmation ---
  const momentumAligned = decisions.filter(
    (d) => d.signal === majoritySignal && (d.metadata as any)?.momentumAligned === true
  ).length;
  const rule8 = momentumAligned >= 2;
  ruleResults['momentum_confirmation'] = rule8;
  if (!rule8) reasons.push(`Only ${momentumAligned} agents confirm momentum alignment (need 2)`);

  // All rules must pass
  const shouldTrade = Object.values(ruleResults).every(Boolean);

  // Position sizing (only if trading)
  let positionSize = 0;
  if (shouldTrade) {
    // Use Kelly suggestions from strategist/quant, or default
    const kellySuggestions = agreeingDecisions
      .filter((d) => d.suggestedSize && d.suggestedSize > 0)
      .map((d) => d.suggestedSize!);

    if (kellySuggestions.length > 0) {
      positionSize = kellySuggestions.reduce((a, b) => a + b, 0) / kellySuggestions.length;
    } else {
      positionSize = config.bot.maxSinglePosition * config.bot.bankroll;
    }

    // Cap at max single position
    positionSize = Math.min(positionSize, config.bot.maxSinglePosition * config.bot.bankroll);
    // Cap at remaining exposure room
    positionSize = Math.min(positionSize, maxExposure - currentExposure);
    // Ensure positive
    positionSize = Math.max(0, positionSize);
  }

  return {
    shouldTrade,
    signal: shouldTrade ? majoritySignal : 'HOLD',
    averageConfidence: avgConfidence,
    agreeCount,
    positionSize,
    edge: avgEdge,
    reasons: shouldTrade ? ['All 8 consensus rules passed'] : reasons,
    ruleResults,
    decisions,
    marketId: market.conditionId,
    timestamp,
  };
}
