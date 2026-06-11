// Матрица прав роль×действие — артефакт done-критерия NEXADM-7.
// Источник истины: work_directory/01_specs/02_sprint2_1_auth_spec.md, п.3
// (согласовано управленцем 2026-06-11). Меняется только через ревизию спеки.

export type Role = "owner" | "admin" | "employee" | "client";

export const ROLES: Role[] = ["owner", "admin", "employee", "client"];

export const can = {
  /** Видеть все проекты (Employee — только свои, через membership) */
  seeAllProjects: (r: Role) => r === "owner" || r === "admin",
  /** Видеть затраты: токены, ≈$, часы. Employee — НЕ видит (решение спеки 2.1) */
  seeCosts: (r: Role) => r === "owner" || r === "admin",
  /**
   * Drill-down до моделей AI. Реализация эпохи 5: панель моделей целиком состоит
   * из затрат (время/токены/$), поэтому фактический gate — seeCosts (Owner/Admin);
   * Employee видит структуру drill-down своих проектов без затратных колонок.
   */
  drillDownModels: (r: Role) => r === "owner" || r === "admin",
  /** Пригласить / удалить пользователя / сменить роль (кроме Owner) */
  manageUsers: (r: Role) => r === "owner" || r === "admin",
  /** Назначить роль Admin */
  assignAdmin: (r: Role) => r === "owner",
  /** Редактировать описания проектов */
  editProjectMeta: (r: Role) => r === "owner" || r === "admin",
  /** Назначать участников проекта (membership) */
  manageMembership: (r: Role) => r === "owner" || r === "admin",
  /** Служебная страница /styleguide */
  seeStyleguide: (r: Role) => r === "owner" || r === "admin",
} as const;

/**
 * Удалить/понизить Owner не может никто. Admin не трогает другого Admin
 * (privilege containment, решение ревью 2.2 — UI и сервер теперь согласованы).
 */
export function canModifyUser(actor: Role, target: Role): boolean {
  if (target === "owner") return false; // Owner неприкосновенен для всех
  if (actor === "owner") return true;
  if (actor === "admin") return target === "employee" || target === "client";
  return false;
}
