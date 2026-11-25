import { SHOP_NAME } from '@desert-web/shared';
import { getShopInfo } from '@/lib/shop-info';

/**
 * Pagrindinio puslapio šūkis: puslapio h1 visose būsenose. Tekstai iš admin nustatymų
 * (tuščia antra eilutė nerodoma; tuščias šūkis: parduotuvės pavadinimas, kad h1 liktų).
 */
export async function Hero() {
  const { texts } = await getShopInfo();
  return (
    <section className="hero" aria-labelledby="hero-title">
      <h1 id="hero-title" className="hero-title">
        {texts.tagline || SHOP_NAME}
      </h1>
      {texts.subtagline ? <p className="hero-sub">{texts.subtagline}</p> : null}
    </section>
  );
}
