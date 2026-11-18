import {
  PRODUCT_IMAGE_FORMATS,
  PRODUCT_IMAGE_MAX_DIMENSION,
  type ProductImageUploadSignatureDto,
} from '@desert-web/shared';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import type { Env } from '../config/env';
import { verifyCloudinaryResponseSignature } from './cloudinary-signature';

export interface CloudinarySettings {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  folder: string;
}

/** Pasirašomi įkėlimo parametrai, be timestamp. Klientas jų pakeisti negali. */
export const UPLOAD_ALLOWED_FORMATS = PRODUCT_IMAGE_FORMATS.join(',');
export const UPLOAD_TRANSFORMATION = `c_limit,h_${PRODUCT_IMAGE_MAX_DIMENSION},w_${PRODUCT_IMAGE_MAX_DIMENSION}`;

/**
 * Plonas sluoksnis virš Cloudinary SDK. Globalios SDK konfigūracijos nenaudojam:
 * prisijungimo duomenys perduodami kiekvienam kvietimui. Paslaptis ir pilni parašai
 * niekada nerašomi į logus.
 */
@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);
  private readonly settings: CloudinarySettings | null;

  constructor(config: ConfigService<Env, true>) {
    const cloudName = config.get('CLOUDINARY_CLOUD_NAME', { infer: true });
    const apiKey = config.get('CLOUDINARY_API_KEY', { infer: true });
    const apiSecret = config.get('CLOUDINARY_API_SECRET', { infer: true });
    const folder = config.get('CLOUDINARY_FOLDER', { infer: true });
    this.settings =
      cloudName && apiKey && apiSecret ? { cloudName, apiKey, apiSecret, folder } : null;
  }

  /** Nustatymai arba 503 IMAGES_NOT_CONFIGURED (produkcijoje API be jų nepasileidžia). */
  require(): CloudinarySettings {
    if (!this.settings) {
      throw new ServiceUnavailableException({
        code: 'IMAGES_NOT_CONFIGURED',
        message:
          'Nuotraukų įkėlimas nesukonfigūruotas: API trūksta CLOUDINARY_CLOUD_NAME, ' +
          'CLOUDINARY_API_KEY arba CLOUDINARY_API_SECRET.',
      });
    }
    return this.settings;
  }

  /** Pasirašyti tiesioginio įkėlimo (naršyklė → Cloudinary) parametrai. */
  signUpload(now: Date = new Date()): ProductImageUploadSignatureDto {
    const s = this.require();
    const timestamp = Math.floor(now.getTime() / 1000);
    const params = {
      allowed_formats: UPLOAD_ALLOWED_FORMATS,
      folder: s.folder,
      timestamp,
      transformation: UPLOAD_TRANSFORMATION,
    };
    return {
      cloudName: s.cloudName,
      apiKey: s.apiKey,
      uploadUrl: `https://api.cloudinary.com/v1_1/${s.cloudName}/image/upload`,
      timestamp,
      signature: cloudinary.utils.api_sign_request(params, s.apiSecret),
      folder: s.folder,
      allowedFormats: UPLOAD_ALLOWED_FORMATS,
      transformation: UPLOAD_TRANSFORMATION,
    };
  }

  verifyResponseSignature(publicId: string, version: number, signature: string): boolean {
    return verifyCloudinaryResponseSignature(
      publicId,
      version,
      signature,
      this.require().apiSecret,
    );
  }

  /**
   * Ištrina nuotrauką iš Cloudinary. Geriausiomis pastangomis: klaida tik užrašoma į logą
   * (DB jau atnaujinta, o likusi nuotrauka Cloudinary nieko nesugadina).
   */
  async destroyBestEffort(publicId: string): Promise<void> {
    const s = this.settings;
    if (!s) return;
    try {
      // SDK tipai neaprašo prisijungimo duomenų kvietimo parinktyse, bet SDK juos priima.
      const options = {
        resource_type: 'image' as const,
        invalidate: true,
        cloud_name: s.cloudName,
        api_key: s.apiKey,
        api_secret: s.apiSecret,
      };
      const result = (await cloudinary.uploader.destroy(publicId, options)) as
        { result?: string } | undefined;
      if (result?.result !== 'ok' && result?.result !== 'not found') {
        this.logger.warn(`Cloudinary destroy ${publicId}: netikėtas atsakymas ${result?.result}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : JSON.stringify(error);
      this.logger.warn(`Cloudinary destroy ${publicId} nepavyko: ${message}`);
    }
  }
}
