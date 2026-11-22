import { SHOP_SUBTAGLINE, SHOP_TAGLINE } from '@/lib/shop';

/** Pagrindinio puslapio šūkis: puslapio h1 visose būsenose. */
export function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <h1 id="hero-title" className="hero-title">
        {SHOP_TAGLINE}
      </h1>
      <p className="hero-sub">{SHOP_SUBTAGLINE}</p>
    </section>
  );
}
