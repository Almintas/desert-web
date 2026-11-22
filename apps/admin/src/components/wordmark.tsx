import { SHOP_NAME } from '@desert-web/shared';

/**
 * Kompaktiškas parduotuvės logotipas (kaip apps/web components/wordmark.tsx, be macaron taško
 * ir smulkios eilutės): Bodoni Moda, „Vincento“ virš „Macarons“. Tarpas tarp eilučių lieka
 * tekste, todėl ekrano skaitytuvai skaito „Vincento Macarons“.
 */
export function Wordmark() {
  const words = SHOP_NAME.split(/\s+/).filter(Boolean);
  return (
    <p className="brand">
      {words.map((word, i) => (
        <span key={word} className="brand-line">
          {word}
          {i < words.length - 1 ? ' ' : null}
        </span>
      ))}
    </p>
  );
}
