export const SIGNAL_STATUS = {
  PENDING: 'pending',
  EXECUTED: 'executed',
  EXPIRED: 'expired',
  IGNORED: 'ignored',
} as const;

export type SignalStatus = (typeof SIGNAL_STATUS)[keyof typeof SIGNAL_STATUS];

export interface Signal {
  id: string;
  strategyId: string;
  symbol: string;
  side: 'buy' | 'sell';
  metadata: Record<string, unknown>;
  status: SignalStatus;
  triggeredAt: string;
  executedAt?: string;
}
