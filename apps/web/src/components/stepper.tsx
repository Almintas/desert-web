'use client';

interface Props {
  /** Prekės pavadinimas ekrano skaitytuvams („Makaronai 12 vnt.“). */
  label: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
  /**
   * Ekrano skaitytuvų tekstai kitokiam kiekiui (pvz., kiek supakuoti kaip dovaną).
   * Numatyta: krepšelio kiekis („Kiekis: …“, „Mažinti kiekį: …“, „Didinti kiekį: …“).
   */
  labels?: { group: string; decrease: string; increase: string; value: string };
  /** Tekstas po reikšme, pvz., „iš 3“. */
  valueSuffix?: string;
  /** Mažesnis variantas (mygtukai 44 px). */
  compact?: boolean;
}

/**
 * Kiekio pasirinkimas: „−“, reikšmė, „+“. Mygtukai lieka fokusuojami ir ribose (aria-disabled),
 * kad klaviatūros naudotojas nepamestų fokuso, o pakeistas kiekis perskaitomas (aria-live).
 */
export function Stepper({ label, value, max, onChange, labels, valueSuffix, compact }: Props) {
  const canDecrease = value > 0;
  const canIncrease = value < max;
  const text = labels ?? {
    group: `Kiekis: ${label}`,
    decrease: `Mažinti kiekį: ${label}`,
    increase: `Didinti kiekį: ${label}`,
    value: 'Krepšelyje: ',
  };
  return (
    <div className={compact ? 'stepper compact' : 'stepper'} role="group" aria-label={text.group}>
      <button
        type="button"
        className="stepper-button"
        aria-label={text.decrease}
        aria-disabled={!canDecrease}
        onClick={() => canDecrease && onChange(value - 1)}
      >
        <span aria-hidden="true">−</span>
      </button>
      <output className="stepper-value" aria-live="polite" aria-atomic="true">
        <span className="visually-hidden">{text.value}</span>
        {value}
        {valueSuffix ? <span className="stepper-suffix"> {valueSuffix}</span> : null}
      </output>
      <button
        type="button"
        className="stepper-button"
        aria-label={text.increase}
        aria-disabled={!canIncrease}
        title={canIncrease ? undefined : `Daugiausia ${max} vnt.`}
        onClick={() => canIncrease && onChange(value + 1)}
      >
        <span aria-hidden="true">+</span>
      </button>
    </div>
  );
}
