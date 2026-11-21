import type { EmailMessage, EmailSender } from './email-sender';

/** Testams: laiškai tik įrašomi į `sent`. `failWith` imituoja Resend klaidą. */
export class InMemoryEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];
  failWith: Error | null = null;

  async send(message: EmailMessage): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.sent.push(message);
  }

  clear(): void {
    this.sent.length = 0;
    this.failWith = null;
  }
}
