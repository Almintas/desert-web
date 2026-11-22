import { cloudinaryImageUrl, type PublicProductImageDto } from '@desert-web/shared';

const WIDTHS = [320, 480, 640, 960];
/** Kortelė: 1 stulpelis iki 600 px, 2 iki 960 px, 3 plačiau, ne platesnė nei ~370 px (žr. globals.css). */
const SIZES =
  '(max-width: 599px) min(calc(100vw - 32px), 480px), (max-width: 959px) calc(50vw - 40px), 370px';

interface Props {
  image: PublicProductImageDto | undefined;
  alt: string;
  /** Pirmoje eilėje: įkeliama iškart, pirmoji su aukštu prioritetu. */
  eager: boolean;
  priority: boolean;
  /** `sizes` atributas, jei nuotrauka ne kortelės dydžio (pvz., užsakymo puslapyje). */
  sizes?: string;
}

/** Pagrindinė nuotrauka 4:3, Cloudinary parenka formatą ir dydį (srcset). */
export function ProductImage({ image, alt, eager, priority, sizes = SIZES }: Props) {
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
      sizes={sizes}
      width={640}
      height={480}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding="async"
    />
  );
}
