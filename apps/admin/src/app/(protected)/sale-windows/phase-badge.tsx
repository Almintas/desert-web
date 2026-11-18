import type { SaleWindowPhase } from '@desert-web/shared';
import { PHASE_LABELS } from './form-state';

export function PhaseBadge({ phase }: { phase: SaleWindowPhase }) {
  return <span className={`badge phase-${phase}`}>{PHASE_LABELS[phase]}</span>;
}
