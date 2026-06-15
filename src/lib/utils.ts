// 通用工具函数（兼容本项目结构）
export function cn(...args: any[]): string {
  const out: string[] = [];
  for (const a of args) {
    if (!a) continue;
    if (typeof a === 'string' || typeof a === 'number') {
      out.push(String(a));
    } else if (Array.isArray(a)) {
      out.push(cn(...a));
    } else if (typeof a === 'object') {
      for (const k of Object.keys(a)) {
        if ((a as any)[k]) out.push(k);
      }
    }
  }
  return out.join(' ');
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
