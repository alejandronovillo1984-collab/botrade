export interface Strategy {
  id: string;
  name: string;
  detail: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StrategyCreateInput {
  name: string;
  detail: string;
  isActive?: boolean;
}

export interface StrategyUpdateInput {
  name?: string;
  detail?: string;
  isActive?: boolean;
}
