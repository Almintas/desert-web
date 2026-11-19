'use client';

interface Props {
  /** Prekės pavadinimas ekrano skaitytuvams („Makaronai 12 vnt.“). */
  label: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
}

/**
 * Kiekio pasirinkimas: „−“, reikšmė, „+“. Mygtukai lieka fokusuojami ir ribose (aria-disabled),
 * kad klaviatūros naudotojas nepamestų fokuso, o pakeistas kiekis perskaitomas (aria-live).
 */
export function Stepper({ label, value, max, onChange }: Props) {
  const canDecrease = value > 0;
  const canIncrease = value < max;
  return (
    <div className="stepper" role="group" aria-label={`Kiekis: ${label}`}>
      <button
        type="button"
        className="stepper-button"
        aria-label={`Mažinti kiekį: ${label}`}
        aria-disabled={!canDecrease}
        onClick={() => canDecrease && onChange(value - 1)}
      >
        <span aria-hidden="true">−</span>
      </button>
      <output className="stepper-value" aria-live="polite" aria-atomic="true">
        <span className="visually-hidden">Krepšelyje: </span>
        {value}
      </output>
      <button
        type="button"
        className="stepper-button"
        aria-label={`Didinti kiekį: ${label}`}
        aria-disabled={!canIncrease}
        title={canIncrease ? undefined : `Daugiausia ${max} vnt.`}
        onClick={() => canIncrease && onChange(value + 1)}
      >
        <span aria-hidden="true">+</span>
      </button>
    </div>
  );
}
