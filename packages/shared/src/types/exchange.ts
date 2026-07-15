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
  userId: string;
  exchangeId: string;
  label: string;
  credentials: ExchangeCredentials;
  isTestnet: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
