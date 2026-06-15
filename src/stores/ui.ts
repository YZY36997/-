import { defineStore } from 'pinia';
import { lingmo } from '@/api/lingmo';

export const useUiStore = defineStore('ui', {
  state: () => ({
    theme: 'dark' as 'dark' | 'light',
    locale: 'zh-CN' as 'zh-CN' | 'en-US',
    currentProjectId: null as number | null,
    currentProjectName: '',
    ragLevel: 2 as 1 | 2 | 3,
    sidebarCollapsed: false
  }),
  actions: {
    async initTheme() {
      const r = await lingmo.invoke(lingmo.ACTIONS.SYS_GET_THEME);
      if (r.ok && r.data) this.theme = r.data === 'light' ? 'light' : 'dark';
      if (typeof document !== 'undefined') document.documentElement.setAttribute('data-theme', this.theme);
    },
    async toggleTheme() {
      this.theme = this.theme === 'dark' ? 'light' : 'dark';
      if (typeof document !== 'undefined') document.documentElement.setAttribute('data-theme', this.theme);
      await lingmo.invoke(lingmo.ACTIONS.SYS_SET_THEME, { theme: this.theme });
    },
    async initLocale() {
      const r = await lingmo.invoke(lingmo.ACTIONS.SYS_GET_LOCALE);
      if (r.ok && r.data) this.locale = (r.data === 'en-US' || r.data === 'zh-CN') ? r.data : 'zh-CN';
    },
    async setLocale(locale: 'zh-CN' | 'en-US') {
      this.locale = locale;
      await lingmo.invoke(lingmo.ACTIONS.SYS_SET_LOCALE, { locale });
    },
    setProject(id: number, name: string) {
      this.currentProjectId = id;
      this.currentProjectName = name;
    },
    setRagLevel(level: 1 | 2 | 3) { this.ragLevel = level; },
    toggleSidebar() { this.sidebarCollapsed = !this.sidebarCollapsed; }
  }
});
