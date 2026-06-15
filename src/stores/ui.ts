import { defineStore } from 'pinia';
import { lingmo } from '@/api/lingmo';

export const useUiStore = defineStore('ui', {
  state: () => ({
    theme: 'dark' as 'dark' | 'light',
    sidebarCollapsed: false,
    rightPanel: true,
    currentProjectId: null as number | null,
    currentProjectName: ''
  }),
  actions: {
    async initTheme() {
      const r = await lingmo.invoke(lingmo.ACTIONS.SYS_GET_THEME);
      if (r.ok && r.data) this.theme = (r.data as string) === 'light' ? 'light' : 'dark';
      if (typeof document !== 'undefined') document.documentElement.setAttribute('data-theme', this.theme);
    },
    async toggleTheme() {
      this.theme = this.theme === 'dark' ? 'light' : 'dark';
      if (typeof document !== 'undefined') document.documentElement.setAttribute('data-theme', this.theme);
      await lingmo.invoke(lingmo.ACTIONS.SYS_SET_THEME, { theme: this.theme });
    },
    toggleSidebar() { this.sidebarCollapsed = !this.sidebarCollapsed; },
    toggleRight() { this.rightPanel = !this.rightPanel; },
    setProject(id: number | null, name = '') {
      this.currentProjectId = id;
      this.currentProjectName = name;
    }
  }
});
