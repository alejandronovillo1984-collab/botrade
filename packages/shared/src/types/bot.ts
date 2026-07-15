export const BOT_STATUS = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  STOPPED: 'stopped',
  ERROR: 'error',
} as const;

export type BotStatus = (typeof BOT_STATUS)[keyof typeof BOT_STATUS];

export interface Bot {
  id: string;
  userId: string;
  exchangeAccountId: string;
  name: string;
  strategyId: string;
  config: Record<string, unknown>;
  status: BotStatus;
  createdAt: string;
  updatedAt: string;
}
