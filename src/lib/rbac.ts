export const PERMS = {
  TEMPLATES_VIEW: "templates:view",
  TEMPLATES_CREATE: "templates:create",
  TEMPLATES_EDIT_DRAFT: "templates:edit_draft",
  TEMPLATES_SUBMIT: "templates:submit_for_approval",
  TEMPLATES_APPROVE: "templates:approve",
  TEMPLATES_REJECT: "templates:reject",
  TEMPLATES_PUBLISH: "templates:publish",
  TEMPLATES_ARCHIVE: "templates:archive",
} as const;

export type Perm = (typeof PERMS)[keyof typeof PERMS];

export type RoleCode =
  | "A"
  | "V"
  | "K"
  | "B"
  | "C"
  | "C1"
  | "D"
  | "E"
  | "G"
  | "N"
  | "PA"
  | "PB"
  | "PC"
  | "PD"
  | "PF"
  | "I"
  | "PE"
  | "RB";

export function permsForRole(role: RoleCode): Perm[] {
  if (role === "A") {
    return [
      PERMS.TEMPLATES_VIEW,
      PERMS.TEMPLATES_APPROVE,
      PERMS.TEMPLATES_REJECT,
      PERMS.TEMPLATES_PUBLISH,
      PERMS.TEMPLATES_ARCHIVE,
      PERMS.TEMPLATES_CREATE,
    ];
  }

  if (role === "K") {
    return [
      PERMS.TEMPLATES_VIEW,
      PERMS.TEMPLATES_CREATE,
      PERMS.TEMPLATES_EDIT_DRAFT,
      PERMS.TEMPLATES_SUBMIT,
    ];
  }

  // Ventas también puede ver (por compatibilidad); si quieres, lo restringimos solo a K.
  if (role === "V") {
    return [
      PERMS.TEMPLATES_VIEW,
      PERMS.TEMPLATES_CREATE,
      PERMS.TEMPLATES_EDIT_DRAFT,
      PERMS.TEMPLATES_SUBMIT,
    ];
  }

  return [];
}

export function hasPerm(role: RoleCode, perm: Perm) {
  return permsForRole(role).includes(perm);
}

