import { formatPickupInfo, type PickupInfo, type PublicSaleWindowDto } from '@desert-web/shared';
import { formatDateTime, formatOnDateTime } from '@/lib/format';

/**
 * Trumpas „kaip tai veikia“: trys žingsniai su pasirinkto lango duomenimis ir atsiėmimu iš
 * nustatymų. Atstoja atsiėmimo informacijos bloką pagrindiniame puslapyje.
 */
export function OrderSteps({
  saleWindow,
  pickup,
  upcoming = false,
}: {
  saleWindow: PublicSaleWindowDto;
  /** Atsiėmimo vieta ir laikas (bendri visiems langams). */
  pickup: PickupInfo;
  /** Būsimas langas: antras žingsnis sako, kada prasidės prekyba. */
  upcoming?: boolean;
}) {
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
          Atsiėmimas: <strong>{formatPickupInfo(pickup)}</strong>. Sumokėsite vietoje
        </span>
      </li>
    </ol>
  );
}
