export const V17_CONSOLIDATED_PREVIEW_BRANCH = "feature/v17-consolidated-preview";

/**
 * La rama integrada es una autoridad Preview adicional y exacta. Esta función
 * no habilita ningún modo por sí sola: cada dominio conserva su batch, Auth,
 * tenancy, ambiente y permisos propios.
 */
export function isV17ConsolidatedPreviewBranch(branch) {
  return branch === V17_CONSOLIDATED_PREVIEW_BRANCH;
}
