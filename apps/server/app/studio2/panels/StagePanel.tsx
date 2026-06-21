'use client';

import { Presentation } from '@lenzon/player';
import { useStudio } from '../StudioProvider';

export function StagePanel() {
  const { handlePresenterReady } = useStudio();
  return (
    <main className="sb-stage-host">
      <Presentation onReady={handlePresenterReady} />
    </main>
  );
}
