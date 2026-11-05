/**
 * Business rules the agents must operate within. The agents never get to
 * change these — the tools enforce them, so a bad model decision cannot,
 * for example, list a product at a loss or overspend on a supplier order.
 */
export const shopConfig = {
  shopName: 'Trendcart',

  model: 'claude-opus-5-5',

  // --- Research ---
  /** Max products the research agent may shortlist per run. */
  maxCandidatesPerRun: 5,
  /** Don't source products whose landed cost (unit + shipping) exceeds this. */
  maxLandedCost: 60,
  /** Require a human to approve a candidate before it can be listed. */
  requireCandidateApproval: true,
  /** If approval is not required, auto-approve candidates scoring at least this. */
  autoApproveMinScore: 70,

  // --- Listing ---
  /** Price must be at least landed cost * (1 + minMargin). */
  minMargin: 0.35,
  /** And at most landed cost * (1 + maxMargin), to stay competitive. */
  maxMargin: 2.5,

  // --- Fulfillment ---
  /** Run the fulfillment agent automatically after each checkout. */
  autoFulfillOnCheckout: true,
  /** Supplier orders costing more than this are sent to a human instead. */
  maxAutoSpendPerOrder: 250,
};

export function agentMode(): 'live' | 'simulate' {
  const explicit = process.env.AGENT_MODE;
  if (explicit === 'live' || explicit === 'simulate') return explicit;
  return process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? 'live' : 'simulate';
}
