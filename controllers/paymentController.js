const { query } = require('../db');

// Built on first use rather than at require() time: the Stripe constructor
// throws when the key is missing, which used to take the whole server down at
// boot instead of failing only these endpoints.
let stripeClient;
const getStripe = () => {
  if (!process.env.STRIPE_SECRET_KEY) {
    const error = new Error('Stripe is not configured');
    error.status = 503;
    throw error;
  }
  if (!stripeClient) stripeClient = require('stripe')(process.env.STRIPE_SECRET_KEY);
  return stripeClient;
};

const CURRENCY = process.env.STRIPE_CURRENCY || 'usd';

// Money crosses this boundary exactly once, here. Everything upstream works in
// decimal currency units; Stripe wants the smallest unit.
const toMinorUnits = (amount) => Math.round(Number(amount) * 100);

const parseId = (raw) => {
  const id = Number(raw);
  return Number.isInteger(id) ? id : null;
};

const markPaid = async (paymentIntentId) => {
  // Idempotent: the webhook and the client-side confirm both land here, and
  // Stripe retries webhooks, so this must be safe to run repeatedly.
  const { rows } = await query(
    `UPDATE orders SET payment_status = 'Paid'
      WHERE payment_intent_id = $1 AND payment_status <> 'Paid'
      RETURNING id`,
    [paymentIntentId]
  );
  return rows[0]?.id ?? null;
};

/**
 * Creates the PaymentIntent for an existing order.
 *
 * Takes an orderId, never an amount. The order's total was computed server-side
 * from database prices when it was created, so the browser has no say in what
 * gets charged and the amount has a single source of truth.
 */
exports.createPaymentIntent = async (req, res, next) => {
  try {
    const stripe = getStripe();
    const orderId = parseId(req.body?.orderId);
    if (orderId === null) {
      return res.status(400).json({ success: false, message: 'A valid orderId is required' });
    }

    const { rows } = await query(
      'SELECT id, total_amount, payment_status, payment_intent_id FROM orders WHERE id = $1',
      [orderId]
    );
    const order = rows[0];
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    if (order.payment_status === 'Paid') {
      return res.status(409).json({ success: false, message: 'Order is already paid' });
    }

    const amount = toMinorUnits(order.total_amount);
    if (!Number.isInteger(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Order total is invalid' });
    }

    // Reuse the existing intent when the customer retries, rather than leaving
    // a trail of abandoned intents on the account.
    let paymentIntent;
    if (order.payment_intent_id) {
      const existing = await stripe.paymentIntents.retrieve(order.payment_intent_id);
      if (['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(existing.status)) {
        paymentIntent =
          existing.amount === amount
            ? existing
            : await stripe.paymentIntents.update(existing.id, { amount });
      }
    }

    if (!paymentIntent) {
      paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency: CURRENCY,
        automatic_payment_methods: { enabled: true },
        metadata: { orderId: String(order.id) }
      });
      await query('UPDATE orders SET payment_intent_id = $2 WHERE id = $1', [
        order.id,
        paymentIntent.id
      ]);
    }

    res.status(200).json({
      success: true,
      data: {
        clientSecret: paymentIntent.client_secret,
        amount,
        currency: CURRENCY
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Confirms payment for immediate UX. The webhook is the authority; this exists
 * so the success screen doesn't have to wait on Stripe's delivery.
 */
exports.confirmPayment = async (req, res, next) => {
  try {
    const stripe = getStripe();
    const orderId = parseId(req.body?.orderId);
    if (orderId === null) {
      return res.status(400).json({ success: false, message: 'A valid orderId is required' });
    }

    const { rows } = await query(
      'SELECT id, total_amount, payment_status, payment_intent_id FROM orders WHERE id = $1',
      [orderId]
    );
    const order = rows[0];
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    if (order.payment_status === 'Paid') {
      return res.status(200).json({ success: true, data: { paymentStatus: 'Paid' } });
    }
    if (!order.payment_intent_id) {
      return res.status(400).json({ success: false, message: 'No payment started for this order' });
    }

    const intent = await stripe.paymentIntents.retrieve(order.payment_intent_id);

    // Trust Stripe's own record, not the caller's claim - and check the amount
    // too, so a succeeded-but-wrong-amount intent can never mark an order paid.
    if (intent.status !== 'succeeded') {
      return res.status(402).json({
        success: false,
        message: `Payment not completed (status: ${intent.status})`
      });
    }
    if (intent.amount_received !== toMinorUnits(order.total_amount)) {
      console.error(
        `Amount mismatch on order ${order.id}: received ${intent.amount_received}, expected ${toMinorUnits(order.total_amount)}`
      );
      return res.status(409).json({ success: false, message: 'Payment amount does not match the order' });
    }

    await markPaid(order.payment_intent_id);
    res.status(200).json({ success: true, data: { paymentStatus: 'Paid' } });
  } catch (error) {
    next(error);
  }
};

/**
 * Stripe -> us, server to server. This is what guarantees a charged card is
 * never left looking unpaid because the customer closed the tab.
 *
 * Mounted in server.js with express.raw BEFORE express.json: signature
 * verification needs the byte-exact body, which the JSON parser destroys.
 */
exports.handleWebhook = async (req, res) => {
  const signature = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    console.error('STRIPE_WEBHOOK_SECRET is not set - rejecting webhook');
    return res.status(503).send('Webhook not configured');
  }

  let event;
  try {
    event = getStripe().webhooks.constructEvent(req.body, signature, secret);
  } catch (error) {
    // Unsigned or tampered payloads never reach the handlers below.
    console.error('Webhook signature verification failed:', error.message);
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const orderId = await markPaid(event.data.object.id);
        console.log(
          orderId
            ? `Webhook: order ${orderId} marked Paid`
            : `Webhook: payment ${event.data.object.id} already settled or has no order`
        );
        break;
      }
      case 'payment_intent.payment_failed': {
        const intent = event.data.object;
        console.warn(
          `Webhook: payment failed for intent ${intent.id} (order ${intent.metadata?.orderId ?? 'unknown'}): ${intent.last_payment_error?.message ?? 'no reason given'}`
        );
        break;
      }
      default:
        break;
    }
  } catch (error) {
    // Acknowledge anyway: Stripe retries on non-2xx, and a retry storm won't
    // fix a database problem on our side. The failure is in the logs.
    console.error('Webhook handling error:', error);
  }

  res.status(200).json({ received: true });
};
