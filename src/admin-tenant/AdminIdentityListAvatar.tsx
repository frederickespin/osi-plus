import { AdminIdentityAvatar } from "./AdminIdentityFields";
import type { AdminUserIdentityApi, AdminUserIdentitySummary } from "./adminUserIdentityApi";
import { useIdentityPhoto } from "./useAdminIdentityEditor";

export default function AdminIdentityListAvatar({ api, name, summary }: { api: AdminUserIdentityApi; name: string; summary?: AdminUserIdentitySummary }) {
  const photo = useIdentityPhoto(api, summary?.membershipRef || null, Boolean(summary?.hasPhoto), summary?.photoVersion || 0);
  return <AdminIdentityAvatar name={name} photoUrl={photo.url} />;
}
