export interface DMChannelItem {
  id: string;
  partner_id: string;
  partner_username: string;
  partner_display_name: string | null;
  partner_avatar: string | null;
  status: string;
  is_sender: boolean;
  updated_at: string;
  last_message?: string;
  unread_count?: number;
}

interface DmInboxCacheEntry {
  items: DMChannelItem[];
  fetchedAt: number;
  dirty: boolean;
}

export const DM_INBOX_STALE_MS = 20_000;
const dmInboxCache = new Map<string, DmInboxCacheEntry>();

export function getDmInboxCache(userId: string): DmInboxCacheEntry | undefined {
  return dmInboxCache.get(userId);
}

export function setDmInboxCache(userId: string, items: DMChannelItem[]) {
  dmInboxCache.set(userId, {
    items,
    fetchedAt: Date.now(),
    dirty: false,
  });
}

export function markDmInboxDirty(userId?: string) {
  if (userId) {
    const existing = dmInboxCache.get(userId);
    if (existing) {
      existing.dirty = true;
    }
    return;
  }
  for (const entry of dmInboxCache.values()) {
    entry.dirty = true;
  }
}

export function clearDmInboxCache(userId?: string) {
  if (userId) {
    dmInboxCache.delete(userId);
  } else {
    dmInboxCache.clear();
  }
}
