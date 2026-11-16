import {
  type CurrentSaleWindowResponse,
  formatEur,
  formatShopDateTime,
  type PublicSaleWindowDto,
} from '@desert-web/shared';
import { apiGet } from '@/lib/api';

// Lango būsena priklauso nuo laiko, todėl puslapis visada generuojamas iš naujo.
export const dynamic = 'force-dynamic';

async function loadCurrent(): Promise<CurrentSaleWindowResponse | null> {
  try {
    return await apiGet<CurrentSaleWindowResponse>('/sale-windows/current', { cache: 'no-store' });
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const current = await loadCurrent();

  if (!current) {
    return (
      <section className="notice">
        <h1>Šiuo metu nepavyksta pasiekti parduotuvės</h1>
        <p>Pabandyk dar kartą po kelių minučių.</p>
      </section>
    );
  }

  if (current.open) {
    return <OpenWindow saleWindow={current.open} />;
  }

  return (
    <section className="notice">
      <h1>Šiuo metu užsakymų nepriimame</h1>
      {current.upcoming ? (
        <p>
          Kitas pardavimas „{current.upcoming.title}“ prasidės{' '}
          <strong>{formatShopDateTime(current.upcoming.opensAt)}</strong>.
        </p>
      ) : (
        <p>Apie kitą pardavimą pranešime netrukus.</p>
      )}
    </section>
  );
}

function OpenWindow({ saleWindow }: { saleWindow: PublicSaleWindowDto }) {
  return (
    <section>
      <div className="window-header">
        <h1>{saleWindow.title}</h1>
        <p>
          Užsakymai priimami iki <strong>{formatShopDateTime(saleWindow.closesAt)}</strong>
        </p>
        {saleWindow.fulfillment.pickupFrom && (
          <p className="muted">
            Atsiėmimas nuo {formatShopDateTime(saleWindow.fulfillment.pickupFrom)}
            {saleWindow.fulfillment.pickupLocation ? `, ${saleWindow.fulfillment.pickupLocation}` : ''}
          </p>
        )}
      </div>

      <ul className="product-grid">
        {saleWindow.items.map((item) => {
          const soldOut = item.quantityAvailable === 0;
          return (
            <li key={item.variantId} className={`product-card${soldOut ? ' sold-out' : ''}`}>
              <h2>{item.productName}</h2>
              <p className="muted">{item.variantName}</p>
              <p className="price">{formatEur(item.priceCents)}</p>
              <p className="muted">{soldOut ? 'Išparduota' : `Liko: ${item.quantityAvailable}`}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
