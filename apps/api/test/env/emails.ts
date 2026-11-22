/**
 * Importuojamas PIRMAS spec faile: visi laiškai įjungti (Resend raktas, pardavėjo adresas,
 * laiškai pirkėjams). Siuntėjas testuose visada InMemoryEmailSender (žr. helpers.ts).
 */
process.env.RESEND_API_KEY = 're_test_not_a_real_key';
process.env.RESEND_FROM_EMAIL = 'Ieva Macarons <uzsakymai@desertai.example>';
process.env.ORDER_NOTIFY_EMAIL = 'pardavejas@desertai.example';
process.env.CUSTOMER_EMAILS_ENABLED = 'true';
process.env.WEB_URL = 'https://desertai.example/';
process.env.ADMIN_URL = 'https://admin.desertai.example';
