import type { DocumentSnapshot, QuerySnapshot } from 'firebase/firestore';

interface FirestoreReadStats {
  totalReads: number;
  bySource: Record<string, number>;
}

const stats: FirestoreReadStats = {
  totalReads: 0,
  bySource: {},
};

declare global {
  interface Window {
    __ERA_FIRESTORE_READS__?: FirestoreReadStats;
  }
}

function syncWindowStats() {
  if (typeof window !== 'undefined') {
    window.__ERA_FIRESTORE_READS__ = {
      totalReads: stats.totalReads,
      bySource: { ...stats.bySource },
    };
  }
}

export function trackFirestoreReads(source: string, count: number): void {
  if (count <= 0) return;
  stats.totalReads += count;
  stats.bySource[source] = (stats.bySource[source] || 0) + count;
  syncWindowStats();
  console.log(
    `[Firestore Read] +${count} (${source}) | Session Total: ${stats.totalReads}`
  );
}

export function trackDocRead<T>(source: string, snap: DocumentSnapshot<T>): void {
  if (snap.metadata?.fromCache) return;
  trackFirestoreReads(source, 1);
}

export function trackQueryRead<T>(source: string, snap: QuerySnapshot<T>): void {
  if (snap.metadata?.fromCache) return;
  // Firestore bills at least 1 read for a query even when 0 documents match
  trackFirestoreReads(source, Math.max(1, snap.size));
}

export function trackSnapshotReads<T>(
  source: string,
  snap: QuerySnapshot<T>,
  isFirstDelivery: boolean
): void {
  if (snap.metadata?.fromCache) return;
  const delta = isFirstDelivery
    ? Math.max(1, snap.size)
    : snap.docChanges().length;
  if (delta > 0) {
    trackFirestoreReads(source, delta);
  }
}

export function trackDocSnapshotReads<T>(
  source: string,
  snap: DocumentSnapshot<T>
): void {
  if (snap.metadata?.fromCache) return;
  trackFirestoreReads(source, 1);
}

export function getFirestoreReadStats(): FirestoreReadStats {
  return {
    totalReads: stats.totalReads,
    bySource: { ...stats.bySource },
  };
}

export function resetFirestoreReadStats(): void {
  stats.totalReads = 0;
  stats.bySource = {};
  syncWindowStats();
}
