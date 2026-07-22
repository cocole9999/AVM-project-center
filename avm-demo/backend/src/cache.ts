/**
 * 内存 LRU 缓存 (V1.10)
 *
 * 用于缓存低频变动的列表数据（项目/客户/车型/人员/空间），5 分钟 TTL
 * 高频写操作（创建/更新/删除）触发失效
 *
 * 设计取舍：
 * - 不用 redis（部署简单，单进程足够）
 * - 不用 TTL 库（手写简单 LRU，5min 过期）
 * - invalidate() 用于 CRUD 后主动失效
 */

type Entry<T> = { value: T; expireAt: number };

export class TTLCache<T> {
  private map = new Map<string, Entry<T>>();
  constructor(private ttlMs: number = 5 * 60 * 1000) {}

  get(key: string): T | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (Date.now() > e.expireAt) {
      this.map.delete(key);
      return undefined;
    }
    return e.value;
  }

  set(key: string, value: T): void {
    this.map.set(key, { value, expireAt: Date.now() + this.ttlMs });
  }

  invalidate(key: string): void {
    this.map.delete(key);
  }

  invalidatePrefix(prefix: string): void {
    for (const k of this.map.keys()) {
      if (k.startsWith(prefix)) this.map.delete(k);
    }
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

// 业务缓存单例（key 命名空间化）
export const caches = {
  projects: new TTLCache<any[]>(5 * 60 * 1000),
  customers: new TTLCache<any[]>(5 * 60 * 1000),
  carModels: new TTLCache<any[]>(5 * 60 * 1000),
  contacts: new TTLCache<any[]>(5 * 60 * 1000),
  users: new TTLCache<any[]>(10 * 60 * 1000),  // 用户变更更少
  spaces: new TTLCache<any[]>(5 * 60 * 1000),
  workItemTypes: new TTLCache<any>(10 * 60 * 1000),  // 静态数据
};

/** 包装 cache + 加载函数，自动处理 miss + set */
export async function withCache<T>(cache: TTLCache<T>, key: string, loader: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const v = await loader();
  cache.set(key, v);
  return v;
}
