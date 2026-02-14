import type { ModuleId } from '@/App';
import { setActiveOsiId } from '@/lib/hrNotaStorage';

export function openOsi(osiId: string, section: 'plan' | 'nota' | 'approvals' = 'nota') {
  setActiveOsiId(osiId);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem('osi-plus.osi.activeSection', section);
    window.dispatchEvent(new CustomEvent<ModuleId>('changeModule', { detail: 'osi-editor' }));
  }
}
