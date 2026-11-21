'use client';

import {
  type AdminProductImageDto,
  cloudinaryImageUrl,
  PRODUCT_IMAGE_ACCEPT,
  PRODUCT_IMAGE_MAX_COUNT,
} from '@desert-web/shared';
import { type ChangeEvent, useId, useRef, useState } from 'react';
import {
  attachImageAction,
  getUploadSignatureAction,
  type ImageActionResult,
  removeImageAction,
  reorderImagesAction,
} from './image-actions';
import { imageFileError, MAX_MB, UploadError, uploadToCloudinary } from './image-upload';

type UploadStatus = 'queued' | 'uploading' | 'saving' | 'done' | 'error';

interface UploadItem {
  key: string;
  name: string;
  status: UploadStatus;
  /** 0..100, kol keliama į Cloudinary. */
  progress: number;
  error?: string;
}

const STATUS_TEXT: Record<UploadStatus, string> = {
  queued: 'Laukia eilėje',
  uploading: 'Įkeliama…',
  saving: 'Išsaugoma…',
  done: 'Įkelta',
  error: 'Nepavyko',
};

export function ProductImages({
  productId,
  productName,
  initialImages,
}: {
  productId: string;
  productName: string;
  initialImages: AdminProductImageDto[];
}) {
  const uid = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const keySeq = useRef(0);
  const [images, setImages] = useState(initialImages);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const uploading = uploads.some(
    (u) => u.status === 'queued' || u.status === 'uploading' || u.status === 'saving',
  );
  const remaining = PRODUCT_IMAGE_MAX_COUNT - images.length;

  function patchUpload(key: string, patch: Partial<UploadItem>) {
    setUploads((list) => list.map((u) => (u.key === key ? { ...u, ...patch } : u)));
  }

  /** Atnaujina sąrašą iš serverio atsakymo (ir po klaidos, jei serveris grąžino naujausią). */
  function applyResult(result: ImageActionResult) {
    if (result.images) setImages(result.images);
  }

  async function onFilesSelected(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    event.target.value = ''; // tą patį failą vėl galima pasirinkti
    if (files.length === 0) return;
    setError(null);

    // Patikrinimai naršyklėje: tipas, dydis, laisvos vietos.
    let slots = remaining;
    const items: (UploadItem & { file: File })[] = files.map((file) => {
      const key = `upload-${keySeq.current++}`;
      const base = { key, name: file.name, progress: 0, file };
      const fileError = imageFileError(file);
      if (fileError) return { ...base, status: 'error', error: fileError };
      if (slots <= 0) {
        return {
          ...base,
          status: 'error',
          error: `Daugiausia ${PRODUCT_IMAGE_MAX_COUNT} nuotraukos produktui.`,
        };
      }
      slots -= 1;
      return { ...base, status: 'queued' };
    });
    setUploads((list) => [
      ...list.filter((u) => u.status !== 'done' && u.status !== 'error'),
      ...items.map(({ file: _file, ...u }) => u),
    ]);

    const queue = items.filter((i) => i.status === 'queued');
    if (queue.length === 0) return;

    const signed = await getUploadSignatureAction();
    if (!signed.ok) {
      for (const item of queue) patchUpload(item.key, { status: 'error', error: signed.error });
      return;
    }

    // Po vieną: vieno failo klaida kitų nesustabdo.
    for (const item of queue) {
      try {
        patchUpload(item.key, { status: 'uploading' });
        const upload = await uploadToCloudinary(item.file, signed.signature, (progress) =>
          patchUpload(item.key, { progress }),
        );
        patchUpload(item.key, { status: 'saving', progress: 100 });
        const result = await attachImageAction(productId, upload);
        applyResult(result);
        patchUpload(
          item.key,
          result.ok ? { status: 'done' } : { status: 'error', error: result.error },
        );
      } catch (e) {
        patchUpload(item.key, {
          status: 'error',
          error: e instanceof UploadError ? e.message : 'Įkelti nepavyko. Bandyk dar kartą.',
        });
      }
    }
  }

  async function run(action: () => Promise<ImageActionResult>) {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      applyResult(result);
      if (!result.ok) setError(result.error);
    } catch {
      setError('Nepavyko susisiekti su serveriu. Bandyk vėliau.');
    } finally {
      setBusy(false);
    }
  }

  function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= images.length) return;
    const ids = images.map((i) => i.id);
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    void run(() => reorderImagesAction(productId, ids));
  }

  function remove(imageId: string) {
    setConfirmRemove(null);
    void run(() => removeImageAction(productId, imageId));
  }

  const locked = busy || uploading;

  return (
    <section className="panel product-images" aria-labelledby={`${uid}-title`}>
      <div className="panel-header">
        <h2 id={`${uid}-title`}>Nuotraukos</h2>
        <span className="muted small">
          {images.length} iš {PRODUCT_IMAGE_MAX_COUNT}
        </span>
      </div>

      {images.length === 0 ? (
        <p className="hint">Nuotraukų dar nėra. Pirmoji įkelta nuotrauka bus pagrindinė.</p>
      ) : (
        <ol className="image-grid">
          {images.map((image, index) => (
            <li key={image.id} className="image-tile">
              <div className="image-frame">
                {/* Paprastas img, ne next/image: dydį ir formatą parenka Cloudinary (f_auto). */}
                <img
                  src={cloudinaryImageUrl(image.url, { width: 320, height: 320 })}
                  alt={`${productName}, nuotrauka ${index + 1}`}
                  width={160}
                  height={160}
                  loading="lazy"
                />
                {index === 0 ? <span className="badge main-image">Pagrindinė</span> : null}
              </div>
              {confirmRemove === image.id ? (
                <div className="confirm danger" role="group" aria-label="Patvirtinimas">
                  <p>
                    <strong>Pašalinti nuotrauką?</strong> Ji bus ištrinta visam laikui.
                  </p>
                  <div className="panel-actions">
                    <button
                      type="button"
                      className="button danger-solid small"
                      onClick={() => remove(image.id)}
                      disabled={locked}
                    >
                      Taip, pašalinti
                    </button>
                    <button
                      type="button"
                      className="button secondary small"
                      onClick={() => setConfirmRemove(null)}
                    >
                      Ne
                    </button>
                  </div>
                </div>
              ) : (
                <div className="image-actions">
                  <button
                    type="button"
                    className="button secondary small"
                    onClick={() => move(index, -1)}
                    disabled={locked || index === 0}
                    aria-label={`Perkelti nuotrauką ${index + 1} anksčiau`}
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    className="button secondary small"
                    onClick={() => move(index, 1)}
                    disabled={locked || index === images.length - 1}
                    aria-label={`Perkelti nuotrauką ${index + 1} vėliau`}
                  >
                    →
                  </button>
                  <button
                    type="button"
                    className="button secondary danger small"
                    onClick={() => setConfirmRemove(image.id)}
                    disabled={locked}
                    aria-label={`Pašalinti nuotrauką ${index + 1}`}
                  >
                    Pašalinti
                  </button>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {error ? (
        <div className="alert error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}

      <div className="upload-row">
        <input
          ref={inputRef}
          id={`${uid}-file`}
          type="file"
          multiple
          accept={PRODUCT_IMAGE_ACCEPT}
          onChange={onFilesSelected}
          disabled={locked || remaining <= 0}
          className="visually-hidden"
        />
        <button
          type="button"
          className="button"
          onClick={() => inputRef.current?.click()}
          disabled={locked || remaining <= 0}
        >
          {uploading ? 'Įkeliama…' : 'Pridėti nuotraukų'}
        </button>
        <span className="hint">
          {remaining > 0
            ? `JPG, PNG, WEBP arba HEIC, iki ${MAX_MB} MB. Galima pridėti dar ${remaining}.`
            : `Pasiektas ${PRODUCT_IMAGE_MAX_COUNT} nuotraukų limitas. Pašalink kurią nors, kad pridėtum naują.`}
        </span>
      </div>

      {uploads.length > 0 ? (
        <ul className="upload-list" aria-label="Įkėlimai" aria-live="polite">
          {uploads.map((u) => (
            <li key={u.key} className={`upload-item ${u.status}`}>
              <span className="upload-name">{u.name}</span>
              {u.status === 'uploading' ? (
                <progress max={100} value={u.progress} aria-label={`${u.name} įkėlimas`} />
              ) : null}
              <span className="upload-status">
                {u.status === 'uploading'
                  ? `${STATUS_TEXT.uploading} ${u.progress}%`
                  : STATUS_TEXT[u.status]}
              </span>
              {u.error ? <span className="field-error">{u.error}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
