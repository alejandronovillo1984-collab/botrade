export const ROLES = {
  USER: 'user',
  SUPERADMIN: 'superadmin',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export function isValidRole(role: unknown): role is Role {
  return typeof role === 'string' && Object.values(ROLES).includes(role as Role);
}

export function isSuperAdmin(role: Role): boolean {
  return role === ROLES.SUPERADMIN;
}
