import { formatPickupRange } from '@/lib/format';

interface Props {
  location: string | null;
  from: string | null;
  to: string | null;
}

/** Atsiėmimo vieta ir laikas (paskelbtame lange jie privalomi). */
export function PickupInfo({ location, from, to }: Props) {
  return (
    <dl className="pickup-info">
      <div>
        <dt>Atsiėmimo vieta</dt>
        <dd>{location ?? 'Bus patikslinta'}</dd>
      </div>
      <div>
        <dt>Atsiėmimo laikas</dt>
        <dd>{from && to ? formatPickupRange(from, to) : 'Bus patikslintas'}</dd>
      </div>
    </dl>
  );
}
