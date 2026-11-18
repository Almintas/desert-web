import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { validateEnv } from '../src/config/env';
import {
  cloudinaryResponseSignature,
  verifyCloudinaryResponseSignature,
} from '../src/product-images/cloudinary-signature';
import { CloudinaryService } from '../src/product-images/cloudinary.service';

const SECRET = 'test-secret-0123456789';
const PUBLIC_ID = 'desert-web/test/products/abc123';
const VERSION = 1700000000;
/** Žinomas vektorius: printf 'public_id=<id>&version=<v><secret>' | openssl sha1 */
const KNOWN_RESPONSE_SIGNATURE = '2dcc176db7fbb3396ce4af7f9980a09446b6afb7';

function serviceWith(env: Record<string, string>): CloudinaryService {
  const config = validateEnv({ MONGODB_URI: 'mongodb://localhost/x', NODE_ENV: 'test', ...env });
  return new CloudinaryService(new ConfigService(config));
}

describe('Cloudinary atsakymo parašas', () => {
  afterEach(() => {
    cloudinary.config(true); // atstato globalią SDK konfigūraciją
  });

  it('atitinka žinomą vektorių', () => {
    expect(cloudinaryResponseSignature(PUBLIC_ID, VERSION, SECRET)).toBe(KNOWN_RESPONSE_SIGNATURE);
  });

  it('sutampa su oficialaus SDK verify_api_response_signature', () => {
    cloudinary.config({ api_secret: SECRET });
    const utils = cloudinary.utils as unknown as {
      verify_api_response_signature(id: string, v: number, s: string): boolean;
    };
    const ours = cloudinaryResponseSignature(PUBLIC_ID, VERSION, SECRET);
    expect(utils.verify_api_response_signature(PUBLIC_ID, VERSION, ours)).toBe(true);
    expect(utils.verify_api_response_signature(PUBLIC_ID, VERSION + 1, ours)).toBe(false);
  });

  it('tikrinimas: teisingas priimamas, pakeistas bet kuris laukas atmetamas', () => {
    const sig = KNOWN_RESPONSE_SIGNATURE;
    expect(verifyCloudinaryResponseSignature(PUBLIC_ID, VERSION, sig, SECRET)).toBe(true);
    expect(verifyCloudinaryResponseSignature(PUBLIC_ID, VERSION, sig.toUpperCase(), SECRET)).toBe(
      true,
    );
    expect(verifyCloudinaryResponseSignature(`${PUBLIC_ID}x`, VERSION, sig, SECRET)).toBe(false);
    expect(verifyCloudinaryResponseSignature(PUBLIC_ID, VERSION + 1, sig, SECRET)).toBe(false);
    expect(verifyCloudinaryResponseSignature(PUBLIC_ID, VERSION, sig, 'kita-paslaptis')).toBe(
      false,
    );
    expect(verifyCloudinaryResponseSignature(PUBLIC_ID, VERSION, sig.slice(0, 39), SECRET)).toBe(
      false,
    );
  });

  it('SHA-256 parašas (paskyroms su signature_algorithm=sha256)', () => {
    const sha256 = cloudinaryResponseSignature(PUBLIC_ID, VERSION, SECRET, 'sha256');
    expect(sha256).toHaveLength(64);
    expect(verifyCloudinaryResponseSignature(PUBLIC_ID, VERSION, sha256, SECRET)).toBe(true);
  });
});

describe('CloudinaryService.signUpload', () => {
  it('pasirašo folder, timestamp, allowed_formats ir c_limit transformaciją', () => {
    const service = serviceWith({
      CLOUDINARY_CLOUD_NAME: 'desert-cloud',
      CLOUDINARY_API_KEY: '123456789012345',
      CLOUDINARY_API_SECRET: SECRET,
    });

    const signed = service.signUpload(new Date(VERSION * 1000));

    expect(signed).toEqual({
      cloudName: 'desert-cloud',
      apiKey: '123456789012345',
      uploadUrl: 'https://api.cloudinary.com/v1_1/desert-cloud/image/upload',
      timestamp: VERSION,
      folder: 'desert-web/test/products',
      allowedFormats: 'jpg,jpeg,png,webp,heic,heif',
      transformation: 'c_limit,h_2000,w_2000',
      // printf 'allowed_formats=…&folder=…&timestamp=…&transformation=…<secret>' | openssl sha1
      signature: '6dbc4a8bae48186b2b1380b01dce3a0c55b8aa1f',
    });
    // Tas pats per SDK (taip pasirašytų ir Cloudinary serveris).
    expect(
      cloudinary.utils.api_sign_request(
        {
          timestamp: signed.timestamp,
          folder: signed.folder,
          allowed_formats: signed.allowedFormats,
          transformation: signed.transformation,
        },
        SECRET,
      ),
    ).toBe(signed.signature);
  });

  it('be nustatymų: 503 IMAGES_NOT_CONFIGURED', () => {
    const service = serviceWith({});
    try {
      service.signUpload();
      throw new Error('turėjo mesti');
    } catch (error) {
      const e = error as { getStatus(): number; getResponse(): { code: string } };
      expect(e.getStatus()).toBe(503);
      expect(e.getResponse().code).toBe('IMAGES_NOT_CONFIGURED');
    }
  });
});
