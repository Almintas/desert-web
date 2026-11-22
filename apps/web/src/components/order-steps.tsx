import type { PublicSaleWindowDto } from '@desert-web/shared';
import { formatDateTime, formatOnDateTime, formatPickupWhen } from '@/lib/format';

/**
 * Trumpas „kaip tai veikia“: trys žingsniai su pasirinkto lango duomenimis. Atstoja atsiėmimo
 * informacijos bloką pagrindiniame puslapyje (vieta ir laikas čia, kad nesikartotų).
 */
export function OrderSteps({
  saleWindow,
  upcoming = false,
}: {
  saleWindow: PublicSaleWindowDto;
  /** Būsimas langas: antras žingsnis sako, kada prasidės prekyba. */
  upcoming?: boolean;
}) {
  const { pickupLocation, pickupFrom, pickupTo } = saleWindow.fulfillment;
  return (
    <ol className="order-steps" aria-label="Kaip užsakyti">
      <li>
        <span>Išsirinkite desertus</span>
      </li>
      <li>
        <span>
          {upcoming ? (
            <>
              Prekyba prasidės <strong>{formatOnDateTime(saleWindow.opensAt)}</strong>
            </>
          ) : (
            <>
              Užsakykite iki <strong>{formatDateTime(saleWindow.closesAt)}</strong>
            </>
          )}
        </span>
      </li>
      <li>
        <span>
          {pickupLocation && pickupFrom && pickupTo ? (
            <>
              Atsiimkite <strong>{pickupLocation}</strong>,{' '}
              <strong>{formatPickupWhen(pickupFrom, pickupTo)}</strong> ir sumokėkite vietoje
            </>
          ) : (
            'Atsiimkite ir sumokėkite vietoje (vieta ir laikas bus patikslinti)'
          )}
        </span>
      </li>
    </ol>
  );
}
