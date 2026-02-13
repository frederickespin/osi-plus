import type { EmployeeBaseQualification, EmployeeShab } from '@/types/hr-nota-v2.types';
import { GradeLetter } from '@/types/hr-nota-v2.types';
import type { BaseSkill, User, UserRole } from '@/types/osi.types';
import { cbTypes } from '@/data/seeds-hr-nota-v2';

const USERS_STORAGE_KEY = 'osi-plus.users';

const FIELD_STAFF_ROLES: UserRole[] = ['D', 'E', 'G', 'N', 'PA', 'PB', 'PC', 'PD', 'PE', 'PF'];

export const isFieldStaffRole = (role: UserRole) => FIELD_STAFF_ROLES.includes(role);

export const normalizeUsers = (users: any[]) =>
  users.map((user) => {
    const photo = user.avatar ?? user.profilePhotoUrl ?? '';
    const normalized = {
      ...user,
      avatar: photo,
      profilePhotoUrl: photo,
    };

    if (isFieldStaffRole(normalized.role)) {
      return {
        ...normalized,
        notaEnabled: normalized.notaEnabled !== false,
      };
    }
    return {
      ...normalized,
      notaEnabled: false,
    };
  });

const createDefaultBaseQualifications = (): EmployeeBaseQualification[] =>
  cbTypes.map((cb) => ({
    baseTypeId: cb.id,
    grade: GradeLetter.NA,
  }));

const ensureAllBaseQualifications = (
  baseQualifications: EmployeeBaseQualification[]
): EmployeeBaseQualification[] => {
  const byId = new Map(baseQualifications.map((item) => [item.baseTypeId, item]));
  const completed = cbTypes.map((cb) => byId.get(cb.id) ?? { baseTypeId: cb.id, grade: GradeLetter.NA });
  return completed;
};

const baseSkillToCb: Record<BaseSkill, string> = {
  Empacador: 'CB01',
  Estibador: 'CB02',
  Cargador: 'CB02',
  Desarmador: 'CB04',
  Embalador: 'CB03',
};

const mapLegacyShab = (user: User): EmployeeShab[] => {
  const legacy = new Set<string>();
  (user.shabActive || []).forEach((code) => legacy.add(code));
  (user.skills || []).forEach((code) => legacy.add(code));
  if (legacy.size === 0) return [];
  return Array.from(legacy).map((code) => ({
    shabCode: code,
    active: true,
  }));
};

export const migrateUsersToV2 = (users: User[]) => {
  let changed = false;
  const migrated = users.map((user) => {
    let next = { ...user };

    if (!next.baseQualifications || next.baseQualifications.length === 0) {
      next.baseQualifications = createDefaultBaseQualifications();
      changed = true;
    } else {
      const completed = ensureAllBaseQualifications(next.baseQualifications);
      if (completed.length !== next.baseQualifications.length) {
        next.baseQualifications = completed;
        changed = true;
      }
    }

    if (next.baseSkills && next.baseSkills.length > 0) {
      const updated = next.baseQualifications.map((bq) => ({ ...bq }));
      next.baseSkills.forEach((skill) => {
        const cbId = baseSkillToCb[skill];
        const index = updated.findIndex((bq) => bq.baseTypeId === cbId);
        if (index >= 0 && updated[index].grade === GradeLetter.NA) {
          updated[index] = { ...updated[index], grade: GradeLetter.B };
          changed = true;
        }
      });
      next.baseQualifications = updated;
    }

    if (!next.shab || next.shab.length === 0) {
      const mapped = mapLegacyShab(next);
      if (mapped.length > 0) {
        next.shab = mapped;
        changed = true;
      }
    } else {
      const mapped = mapLegacyShab(next);
      if (mapped.length > 0) {
        const existing = new Map(next.shab.map((s) => [s.shabCode, s]));
        mapped.forEach((s) => {
          if (!existing.has(s.shabCode)) {
            existing.set(s.shabCode, s);
            changed = true;
          }
        });
        next.shab = Array.from(existing.values());
      }
    }

    if (!next.allowanceTypeIds) {
      next.allowanceTypeIds = [];
      changed = true;
    }

    return next;
  });

  return { migrated, changed };
};

export const loadUsers = (): User[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(USERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const normalized = normalizeUsers(parsed as User[]);
    const { migrated, changed } = migrateUsersToV2(normalized);
    if (changed) saveUsers(migrated);
    return migrated;
  } catch {
    return [];
  }
};

export const saveUsers = (users: User[]) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
  } catch {
    // Ignore persistence errors (private mode, quota exceeded, etc.)
  }
};

// Placeholder for backend persistence when API is available.
// Replace the body with an API call (POST/PATCH) to your users endpoint.
export const persistUsers = (users: User[]) => {
  saveUsers(users);
};
