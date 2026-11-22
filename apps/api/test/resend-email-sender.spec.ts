import { SHOP_NAME } from '@desert-web/shared';
import { ResendEmailSender, ResendSendError } from '../src/notifications/resend-email-sender';

const message = {
  from: `${SHOP_NAME} <onboarding@resend.dev>`,
  to: 'pardavejas@example.com',
  replyTo: 'ona@example.com',
  subject: 'Naujas užsakymas',
  html: '<p>Labas</p>',
  text: 'Labas',
  idempotencyKey: 'seller-new-order/665f1c2e8b3a4d0012345678',
};

describe('ResendEmailSender', () => {
  it('perduoda html, text, replyTo ir idempotencyKey', async () => {
    const send = jest
      .fn()
      .mockResolvedValue({ data: { id: 'email-1' }, error: null, headers: null });
    await new ResendEmailSender({ emails: { send } } as never).send(message);

    expect(send).toHaveBeenCalledWith(
      {
        from: message.from,
        to: message.to,
        replyTo: message.replyTo,
        subject: message.subject,
        html: message.html,
        text: message.text,
      },
      expect.objectContaining({
        idempotencyKey: message.idempotencyKey,
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('Resend klaidą (grąžinamą, ne metamą) paverčia išimtimi', async () => {
    const send = jest.fn().mockResolvedValue({
      data: null,
      error: {
        name: 'validation_error',
        statusCode: 403,
        message: 'You can only send testing emails to your own email address',
      },
      headers: null,
    });
    const sender = new ResendEmailSender({ emails: { send } } as never);

    const error = await sender.send(message).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ResendSendError);
    expect(error).toMatchObject({ code: 'validation_error', statusCode: 403 });
    expect((error as Error).message).toMatch(/testing emails/);
  });
});
