/** Vienas paruoštas laiškas (turinys jau sugeneruotas šablonų). */
export interface EmailMessage {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  /**
   * Resend idempotency key (galioja 24 h): tas pats raktas antrą kartą laiško neišsiunčia,
   * pvz., `order-created/<orderId>`.
   */
  idempotencyKey: string;
}

/** Laiškų siuntimas. Produkcijoje Resend, testuose InMemoryEmailSender. */
export interface EmailSender {
  /** Meta klaidą, jei laiško išsiųsti nepavyko. */
  send(message: EmailMessage): Promise<void>;
}

export const EMAIL_SENDER = Symbol('EMAIL_SENDER');
