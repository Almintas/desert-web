import { formatPickupInfo, type PickupInfo as Pickup } from '@desert-web/shared';

/** „Atsiėmimas: {vieta}, {laikas}“ (iš nustatymų, bendra visiems langams). */
export function PickupInfo({ pickup }: { pickup: Pickup }) {
  return (
    <dl className="pickup-info">
      <div>
        <dt>Atsiėmimas</dt>
        <dd>{formatPickupInfo(pickup)}</dd>
      </div>
    </dl>
  );
}
