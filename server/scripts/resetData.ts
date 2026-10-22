import type { Secrets } from '../config';
import { seedDemoData } from '../seed';
import type { Store } from '../store';

export function resetDemoData(store: Store, secrets: Secrets): void {
  store.wipeData();
  seedDemoData(store, secrets);
}

export function seedIfEmpty(store: Store, secrets: Secrets): boolean {
  const empty = store.listProducts({ sort: 'created_desc', page: 1, pageSize: 1 }).total === 0;
  if (empty) seedDemoData(store, secrets);
  return empty;
}
