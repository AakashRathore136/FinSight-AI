/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Centralised role definitions for FinSight AI.
 *
 * SECURITY: New users MUST always be assigned {@link DEFAULT_ROLE}.
 * Privileged roles (senior_pm, cro, compliance, admin) may only be
 * granted server-side via the Firebase Admin SDK — never from client
 * code or user-controlled input.
 *
 * @see firestore.rules — `allow create` on `/users/{userId}` enforces
 *      `incoming().role == 'junior_analyst'` as an additional server-side
 *      guard against client tampering.
 * @see Issue #505 — privilege escalation via signup role assignment
 */

/** The default, unprivileged role assigned to every new account. */
export const DEFAULT_ROLE = "junior_analyst" as const;

/** All valid roles recognised by the platform. */
export const VALID_ROLES = [
  "junior_analyst",
  "senior_pm",
  "cro",
  "compliance",
  "admin",
] as const;

/** Roles that require elevated privileges and cannot be self-assigned. */
export const PRIVILEGED_ROLES = [
  "senior_pm",
  "cro",
  "compliance",
  "admin",
] as const;

export type UserRole = (typeof VALID_ROLES)[number];

/**
 * Sanitise a role value to ensure it is valid.
 * Returns {@link DEFAULT_ROLE} for any unrecognised or privileged value
 * when `allowPrivileged` is false.
 */
export function sanitizeRole(
  role: unknown,
  allowPrivileged = true,
): UserRole {
  if (
    typeof role === "string" &&
    (VALID_ROLES as readonly string[]).includes(role)
  ) {
    if (
      !allowPrivileged &&
      (PRIVILEGED_ROLES as readonly string[]).includes(role)
    ) {
      return DEFAULT_ROLE;
    }
    return role as UserRole;
  }
  return DEFAULT_ROLE;
}
