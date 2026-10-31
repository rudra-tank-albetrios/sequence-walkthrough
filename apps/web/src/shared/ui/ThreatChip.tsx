import type { Threat, ThreatLevel } from '@swv/core';

import { Chip, type ChipTone } from './Chip.tsx';

const TONE: Readonly<Record<ThreatLevel, ChipTone>> = {
  high: 'error',
  medium: 'unconfirmed',
  low: 'neutral',
};

/** One `@threat` as a small labelled pill, worded as a possible problem and not a verdict. */
export function ThreatChip({ threat, onClick }: { threat: Threat; onClick?: () => void }) {
  return (
    <Chip
      tone={TONE[threat.level]}
      title={`Possible problem, please check: ${threat.text}`}
      data-testid="threat-chip"
      {...(onClick ? { onClick } : {})}
    >
      {threat.level} threat
    </Chip>
  );
}
