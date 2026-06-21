'use client';

import { useEffect, useState } from 'react';

export type StackStamp = {
  producerVersion: string;
  templateVersions: Record<string, string>;
};

/**
 * Fetches the deployed ("HEAD") stack stamp from /api/stack-stamp. This
 * is separate from the script's captured stamp (stored on the Script row) —
 * the strip compares the two so reviewers can see drift between what the
 * script was built with and what's running now.
 */
export function useStackStamp(): StackStamp | null {
  const [stamp, setStamp] = useState<StackStamp | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/stack-stamp')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: StackStamp | null) => {
        if (!cancelled && data) setStamp(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return stamp;
}
