import type { Resend } from 'resend';
import type { EmailMessage, EmailSender } from './email-sender';

/** Kiek laukti Resend atsakymo, kad pakibęs kvietimas neliktų atmintyje amžinai. */
const SEND_TIMEOUT_MS = 15_000;

/** Resend klaida su API kodu (pvz., validation_error, 403 invalid_from_address). */
export class ResendSendError extends Error {
  constructor(
    readonly code: string,
    readonly statusCode: number | null,
    message: string,
  ) {
    super(message);
    this.name = 'ResendSendError';
  }
}

/** Oficialus `resend` SDK. Jis klaidų nemeta, o grąžina `{ error }`: paverčiam jas išimtimis. */
export class ResendEmailSender implements EmailSender {
  constructor(private readonly client: Pick<Resend, 'emails'>) {}

  async send(message: EmailMessage): Promise<void> {
    const { error } = await this.client.emails.send(
      {
        from: message.from,
        to: message.to,
        replyTo: message.replyTo,
        subject: message.subject,
        html: message.html,
        text: message.text,
      },
      { idempotencyKey: message.idempotencyKey, signal: AbortSignal.timeout(SEND_TIMEOUT_MS) },
    );
    if (error) throw new ResendSendError(error.name, error.statusCode, error.message);
  }
}
