import { computed } from 'vue';
import { useUiStore } from '@/stores/ui';
import { dictionaries, type LocaleKey } from '@/i18n';

/** 简易翻译工具：按路径 (nav.home / home.newProject) 获取文本 */
function pick(obj: any, path: string): string {
  const parts = path.split('.');
  let cur: any = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return path;
    cur = cur[p];
  }
  return typeof cur === 'string' ? cur : path;
}

export function useI18n() {
  const ui = useUiStore();
  const dict = computed(() => dictionaries[ui.locale as LocaleKey] || dictionaries['zh-CN']);
  function t(path: string): string { return pick(dict.value, path); }
  return { t, dict, locale: computed(() => ui.locale) };
}
