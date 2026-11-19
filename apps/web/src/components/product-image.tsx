import { cloudinaryImageUrl, type PublicProductImageDto } from '@desert-web/shared';

const WIDTHS = [320, 480, 640, 960];
/** Kortelė: 1 stulpelis iki 560 px, 2 iki 900 px, 3 plačiau (žr. globals.css). */
const SIZES = '(max-width: 559px) calc(100vw - 32px), (max-width: 899px) calc(50vw - 40px), 300px';

interface Props {
  image: PublicProductImageDto | undefined;
  alt: string;
  /** Pirmoje eilėje: įkeliama iškart, pirmoji su aukštu prioritetu. */
  eager: boolean;
  priority: boolean;
}

/** Pagrindinė nuotrauka 4:3, Cloudinary parenka formatą ir dydį (srcset). */
export function ProductImage({ image, alt, eager, priority }: Props) {
  if (!image) {
    return (
      <div className="product-image placeholder" aria-hidden="true">
        <span>🧁</span>
      </div>
    );
  }
  const src = (w: number) =>
    cloudinaryImageUrl(image.url, { width: w, height: Math.round((w * 3) / 4) });
  return (
    <img
      className="product-image"
      src={src(640)}
      srcSet={WIDTHS.map((w) => `${src(w)} ${w}w`).join(', ')}
      sizes={SIZES}
      width={640}
      height={480}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding="async"
    />
  );
}
