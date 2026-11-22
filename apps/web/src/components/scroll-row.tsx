'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';

/**
 * Horizontaliai slenkama eilutė (skirtukai): aktyvus elementas (`aria-current`) paslenkamas į
 * matomą vietą, o kraštuose rodomas šešėlis, jei yra daugiau turinio. Be JS veikia kaip įprasta
 * slenkama eilutė.
 */
export function ScrollRow({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ start: false, end: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const active = el.querySelector<HTMLElement>('[aria-current]');
    if (active) {
      // scrollLeft, ne scrollIntoView: pastarasis gali paslinkti ir visą puslapį.
      const box = el.getBoundingClientRect();
      const item = active.getBoundingClientRect();
      if (item.left < box.left || item.right > box.right) {
        el.scrollLeft += item.left - box.left - (box.width - item.width) / 2;
      }
    }
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      setMore({ start: el.scrollLeft > 1, end: el.scrollLeft < max - 1 });
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, []);

  return (
    <div
      className={`scroll-row${className ? ` ${className}` : ''}`}
      data-more-start={more.start || undefined}
      data-more-end={more.end || undefined}
    >
      <div ref={ref} className="scroll-row-track">
        {children}
      </div>
    </div>
  );
}
