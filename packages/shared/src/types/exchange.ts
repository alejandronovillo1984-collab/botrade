export const EXCHANGE_CREDENTIAL_TYPES = {
  API_KEY: 'api_key',
  OAUTH: 'oauth',
  USERNAME_PASSWORD: 'username_password',
} as const;

export type ExchangeCredentialType =
  (typeof EXCHANGE_CREDENTIAL_TYPES)[keyof typeof EXCHANGE_CREDENTIAL_TYPES];

export interface ExchangeDefinition {
  id: string;
  name: string;
  adapterType: string;
  supportedMarkets: string[];
  credentialType: ExchangeCredentialType;
  isActive: boolean;
}

export interface ApiKeyCredentials {
  type: 'api_key';
  apiKey: string;
  secret: string;
  passphrase?: string;
}

export interface OAuthCredentials {
  type: 'oauth';
  token: string;
  refreshToken?: string;
  expiresAt?: string;
}

export interface UsernamePasswordCredentials {
  type: 'username_password';
  username: string;
  password: string;
}

export type ExchangeCredentials =
  | ApiKeyCredentials
  | OAuthCredentials
  | UsernamePasswordCredentials;

export interface ExchangeAccount {
  id: string;
  exchangeId: string;
  label: string;
  credentials: ExchangeCredentials;
  isTestnet: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ExchangeAccountCreateInput {
  exchangeId: string;
  label?: string;
  token: string;
  isTestnet?: boolean;
}

export const SUPPORTED_EXCHANGES: readonly ExchangeDefinition[] = [
  {
    id: 'ninjatrader',
    name: 'NinjaTrader',
    adapterType: 'ninjatrader',
    supportedMarkets: ['futures'],
    credentialType: EXCHANGE_CREDENTIAL_TYPES.OAUTH,
    isActive: true,
  },
  {
    id: 'tradovate',
    name: 'Tradovate',
    adapterType: 'tradovate',
    supportedMarkets: ['futures'],
    credentialType: EXCHANGE_CREDENTIAL_TYPES.OAUTH,
    isActive: true,
  },
] as const;

export function findSupportedExchange(id: string): ExchangeDefinition | undefined {
  return SUPPORTED_EXCHANGES.find((e) => e.id === id);
}
