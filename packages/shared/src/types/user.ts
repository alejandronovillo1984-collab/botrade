import { Role } from './role';

export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: Role;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserCreateInput {
  uid: string;
  email: string | null;
  displayName?: string | null;
}

export interface UserUpdateInput {
  displayName?: string | null;
  isActive?: boolean;
  role?: Role;
}
