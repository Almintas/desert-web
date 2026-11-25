import type { OrderStatus, SellerDetails } from '@desert-web/shared';
import { Inject, Injectable, Logger, type OnApplicationShutdown, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { Env } from '../config/env';
import type { Order } from '../orders/order.schema';
import { orderTotals } from '../orders/orders.mapper';
import { SaleWindow } from '../sale-windows/sale-window.schema';
import { SettingsService } from '../settings/settings.service';
import { EMAIL_SENDER, type EmailMessage, type EmailSender } from './email-sender';
import {
  CUSTOMER_STATUS_EMAILS,
  type CustomerStatusEmail,
  type OrderEmailData,
  renderCustomerOrderReceived,
  renderCustomerOrderStatus,
  renderSellerNewOrder,
  type RenderedEmail,
} from './order-email-templates';

/** Kiek ilgiausiai laukti neišsiųstų laiškų stabdant aplikaciją (Railway SIGTERM). */
const SHUTDOWN_WAIT_MS = 10_000;

type Template = 'order-created' | `order-status-${CustomerStatusEmail}` | 'seller-new-order';

interface PlannedEmail {
  template: Template;
  audience: 'customer' | 'seller';
  render: (data: OrderEmailData) => RenderedEmail;
  idempotencyKey: string;
}

const isCustomerStatusEmail = (status: OrderStatus): status is CustomerStatusEmail =>
  (CUSTOMER_STATUS_EMAILS as readonly string[]).includes(status);

/**
 * Užsakymų laiškai. Kviečiama tik PO sėkmingos DB transakcijos ir niekada nemeta klaidų:
 * siuntimas vyksta fone (HTTP atsakymas Resend nelaukia), o nepavykęs laiškas tik
 * užrašomas į logą (užsakymo ID, šablonas, Resend klaida).
 */
@Injectable()
export class OrderNotificationsService implements OnApplicationShutdown {
  private readonly logger = new Logger(OrderNotificationsService.name);
  private readonly pending = new Set<Promise<void>>();

  private readonly nodeEnv: Env['NODE_ENV'];
  private readonly apiKeySet: boolean;
  private readonly from: string;
  private readonly sellerEmail: string | undefined;
  private readonly customerEmailsEnabled: boolean;
  private readonly webUrl: string | undefined;
  private readonly adminUrl: string | undefined;

  constructor(
    config: ConfigService<Env, true>,
    @InjectModel(SaleWindow.name) private readonly saleWindowModel: Model<SaleWindow>,
    private readonly settings: SettingsService,
    @Optional() @Inject(EMAIL_SENDER) private readonly sender: EmailSender | null,
  ) {
    this.nodeEnv = config.get('NODE_ENV', { infer: true });
    this.apiKeySet = config.get('RESEND_API_KEY', { infer: true }) !== undefined;
    this.from = config.get('RESEND_FROM_EMAIL', { infer: true });
    this.sellerEmail = config.get('ORDER_NOTIFY_EMAIL', { infer: true });
    this.customerEmailsEnabled = config.get('CUSTOMER_EMAILS_ENABLED', { infer: true });
    this.webUrl = config.get('WEB_URL', { infer: true });
    this.adminUrl = config.get('ADMIN_URL', { infer: true });

    if (this.nodeEnv === 'production') {
      if (!this.apiKeySet) {
        this.logger.warn('RESEND_API_KEY is not set: no order emails will be sent.');
      } else if (!this.sellerEmail) {
        this.logger.warn('ORDER_NOTIFY_EMAIL is not set: seller new-order emails are disabled.');
      }
      if (this.apiKeySet && !this.customerEmailsEnabled) {
        this.logger.log('Customer emails are disabled (CUSTOMER_EMAILS_ENABLED=false).');
      }
    }
  }

  /** Naujas užsakymas (ne idempotentiškas pakartojimas): laiškas pirkėjui ir pardavėjui. */
  orderCreated(order: Order): void {
    const id = order._id.toString();
    this.dispatch(order, [
      {
        template: 'order-created',
        audience: 'customer',
        render: renderCustomerOrderReceived,
        idempotencyKey: `order-created/${id}`,
      },
      {
        template: 'seller-new-order',
        audience: 'seller',
        render: renderSellerNewOrder,
        idempotencyKey: `seller-new-order/${id}`,
      },
    ]);
  }

  /** Tikras būsenos perėjimas (po changeStatus transakcijos). pending ir completed laiško neturi. */
  orderStatusChanged(order: Order, status: OrderStatus): void {
    if (!isCustomerStatusEmail(status)) return;
    this.dispatch(order, [
      {
        template: `order-status-${status}`,
        audience: 'customer',
        render: (data) => renderCustomerOrderStatus(data, status),
        idempotencyKey: `order-status/${order._id.toString()}/${status}`,
      },
    ]);
  }

  /** Testams ir sustabdymui: palaukia, kol bus apdoroti visi fone siunčiami laiškai. */
  async whenIdle(): Promise<void> {
    while (this.pending.size > 0) await Promise.allSettled([...this.pending]);
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.pending.size === 0) return;
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([
      this.whenIdle(),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, SHUTDOWN_WAIT_MS);
      }),
    ]);
    clearTimeout(timer);
  }

  private dispatch(order: Order, planned: PlannedEmail[]): void {
    const task = this.run(order, planned)
      .catch((error: unknown) => {
        // run() pats gaudo kiekvieno laiško klaidas; čia tik netikėtos (pvz., DB skaitymas).
        this.logger.error(
          `Order emails failed (order ${order._id.toString()}): ${describe(error)}`,
        );
      })
      .finally(() => this.pending.delete(task));
    this.pending.add(task);
  }

  private async run(order: Order, planned: PlannedEmail[]): Promise<void> {
    const orderId = order._id.toString();
    const emails = planned.filter((email) => {
      if (email.audience === 'customer' && !this.customerEmailsEnabled) {
        this.logger.debug(
          `Email skipped (order ${orderId}, template ${email.template}): customer emails disabled.`,
        );
        return false;
      }
      if (email.audience === 'seller' && !this.sellerEmail) {
        this.logger.debug(
          `Email skipped (order ${orderId}, template ${email.template}): ORDER_NOTIFY_EMAIL not set.`,
        );
        return false;
      }
      return true;
    });
    if (emails.length === 0) return;
    // Be rakto laiškai nesiunčiami; vystant juos parodom loge, kitur tylim (įspėjimas paleidžiant).
    if (!this.activeSender() && this.nodeEnv !== 'development') return;

    const data = await this.loadData(order);
    for (const email of emails) {
      const rendered = email.render(data);
      const message: EmailMessage = {
        from: this.from,
        to: email.audience === 'customer' ? order.customer.email : this.sellerEmail!,
        // Pardavėjo el. paštas iš nustatymų; kol jis tuščias, pirkėjui Reply-To nenustatomas.
        replyTo:
          email.audience === 'customer' ? data.seller.email || undefined : order.customer.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        idempotencyKey: email.idempotencyKey,
      };
      await this.deliver(orderId, email.template, message);
    }
  }

  /** Siuntėjas tik tada, kai nustatytas RESEND_API_KEY. */
  private activeSender(): EmailSender | null {
    return this.apiKeySet ? this.sender : null;
  }

  private async deliver(orderId: string, template: Template, message: EmailMessage) {
    const sender = this.activeSender();
    if (!sender) {
      this.logger.log(
        `RESEND_API_KEY not set, email not sent (order ${orderId}, template ${template}).\n` +
          `To: ${message.to}\nSubject: ${message.subject}\n\n${message.text}`,
      );
      return;
    }
    try {
      await sender.send(message);
      this.logger.log(`Email sent (order ${orderId}, template ${template}).`);
    } catch (error) {
      this.logger.error(
        `Email failed (order ${orderId}, template ${template}): ${describe(error)}`,
      );
    }
  }

  /** Pardavėjo duomenys iš nustatymų (kol neišsaugoti, numatytieji). */
  private async sellerDetails(): Promise<SellerDetails> {
    return (await this.settings.shopInfo()).seller;
  }

  private async loadData(order: Order): Promise<OrderEmailData> {
    const [saleWindow, seller] = await Promise.all([
      this.saleWindowModel
        .findById(order.saleWindowId, { fulfillment: 1 })
        .lean<Pick<SaleWindow, 'fulfillment'>>()
        .exec(),
      this.sellerDetails(),
    ]);
    const f = saleWindow?.fulfillment;
    const id = order._id.toString();
    return {
      orderId: id,
      orderNumber: order.orderNumber,
      customer: {
        name: order.customer.name,
        email: order.customer.email,
        phone: order.customer.phone,
      },
      items: order.items.map((i) => ({
        productName: i.productName,
        variantName: i.variantName,
        quantity: i.quantity,
        lineTotalCents: i.lineTotalCents,
        giftWrapQuantity: i.giftWrapQuantity ?? 0,
      })),
      ...orderTotals(order),
      fulfillment: {
        method: order.fulfillment.method,
        address: order.fulfillment.address ?? null,
        notes: order.fulfillment.notes ?? null,
      },
      pickup: {
        location: f?.pickupLocation ?? null,
        from: f?.pickupFrom ?? null,
        to: f?.pickupTo ?? null,
      },
      cancellationReason: order.cancellation?.reason || null,
      orderUrl: this.webUrl ? `${this.webUrl}/uzsakymas/${order.accessToken}` : null,
      adminOrderUrl: this.adminUrl ? `${this.adminUrl}/orders/${id}` : null,
      seller,
    };
  }
}

function describe(error: unknown): string {
  if (error instanceof Error) {
    const extra = error as Error & { code?: string; statusCode?: number | null };
    const meta = [extra.code, extra.statusCode].filter((v) => v !== undefined && v !== null);
    return `${error.name}${meta.length ? ` (${meta.join(', ')})` : ''}: ${error.message}`;
  }
  return String(error);
}
