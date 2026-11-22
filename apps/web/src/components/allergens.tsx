/** „kiaušiniai, migdolai, pienas“: kaip įvedė adminas (mažosiomis), atskirta kableliais. */
export const allergenText = (allergens: readonly string[]) => allergens.join(', ');

/** Alergenų eilutė (kortelėje ir krepšelyje). Tuščiam sąrašui nieko nerodo. */
export function AllergenLine({ allergens }: { allergens: readonly string[] }) {
  if (allergens.length === 0) return null;
  return (
    <p className="allergens">
      <span className="allergens-label">Alergenai:</span> {allergenText(allergens)}
    </p>
  );
}
