const { query } = require('../db');
const payments = require('../services/payments');

const parseId = (raw) => {
  const id = Number(raw);
  return Number.isInteger(id) ? id : null;
};

const loadOrder = async (orderId) => {
  const { rows } = await query(
    `SELECT id, total_amount, payment_status, payment_provider, payment_reference
       FROM orders WHERE id = $1`,
    [orderId]
  );
  return rows[0] || null;
};

const markPaid = async (paymentReference) => {
  // Idempotent: the webhook and the client-side confirm can both land here,
  // and providers retry webhooks, so this must be safe to run repeatedly.
  const { rows } = await query(
    `UPDATE orders SET payment_status = 'Paid'
      WHERE payment_reference = $1 AND payment_status <> 'Paid'
      RETURNING id`,
    [paymentReference]
  );
  return rows[0]?.id ?? null;
};

/**
 * Starts payment for an existing order with the active provider.
 *
 * Takes an orderId, never an amount. The order's total was computed server-side
 * from database prices when it was created, so the browser has no say in what
 * gets charged and the amount has a single source of truth.
 */
exports.startPayment = async (req, res, next) => {
  try {
    const provider = payments.getProvider();
    const orderId = parseId(req.body?.orderId);
    if (orderId === null) {
      return res.status(400).json({ success: false, message: 'A valid orderId is required' });
    }

    const order = await loadOrder(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    if (order.payment_status === 'Paid') {
      return res.status(409).json({ success: false, message: 'Order is already paid' });
    }

    const amount = payments.toMinorUnits(order.total_amount);
    if (!Number.isInteger(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Order total is invalid' });
    }

    const session = await provider.startPayment({
      id: order.id,
      amount: Number(order.total_amount),
      amountMinor: amount,
      currency: payments.CURRENCY,
      existingReference: order.payment_reference
    });

    await query(
      `UPDATE orders
          SET payment_provider = $2,
              payment_reference = COALESCE($3, payment_reference)
        WHERE id = $1`,
      [order.id, provider.name, session.reference || null]
    );

    res.status(200).json({
      success: true,
      data: {
        orderId: order.id,
        provider: provider.name,
        mode: session.mode,
        clientData: session.clientData || null,
        amount,
        currency: payments.CURRENCY
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Asks the provider whether the order has been paid, for immediate UX. Where a
 * provider has webhooks they remain the authority; this only spares the
 * success screen from waiting on delivery.
 */
exports.confirmPayment = async (req, res, next) => {
  try {
    const orderId = parseId(req.body?.orderId);
    if (orderId === null) {
      return res.status(400).json({ success: false, message: 'A valid orderId is required' });
    }

    const order = await loadOrder(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    if (order.payment_status === 'Paid') {
      return res.status(200).json({ success: true, data: { paymentStatus: 'Paid' } });
    }
    if (!order.payment_provider || !order.payment_reference) {
      return res.status(400).json({ success: false, message: 'No payment started for this order' });
    }

    const provider = payments.findProvider(order.payment_provider);
    if (!provider) {
      return res.status(503).json({ success: false, message: 'Payment provider unavailable' });
    }

    const result = await provider.verifyPayment({
      id: order.id,
      reference: order.payment_reference,
      amountMinor: payments.toMinorUnits(order.total_amount)
    });

    if (!result.paid) {
      return res.status(200).json({
        success: true,
        data: { paymentStatus: 'Pending', status: result.status || null }
      });
    }

    // Trust the provider's record, not the caller's claim - and check the amount
    // too, so a paid-but-wrong-amount payment can never mark an order paid.
    const expected = payments.toMinorUnits(order.total_amount);
    if (result.amountMinor !== undefined && result.amountMinor !== expected) {
      console.error(
        `Amount mismatch on order ${order.id}: received ${result.amountMinor}, expected ${expected}`
      );
      return res.status(409).json({ success: false, message: 'Payment amount does not match the order' });
    }

    await markPaid(order.payment_reference);
    res.status(200).json({ success: true, data: { paymentStatus: 'Paid' } });
  } catch (error) {
    next(error);
  }
};

/**
 * Provider -> us, server to server: POST /api/payments/webhook/:provider.
 *
 * Mounted in server.js with express.raw BEFORE express.json, because signature
 * verification needs the byte-exact body, which the JSON parser destroys.
 */
exports.handleWebhook = async (req, res) => {
  const provider = payments.findProvider(req.params.provider);
  if (!provider || typeof provider.handleWebhook !== 'function') {
    return res.status(404).json({ success: false, message: 'Not found' });
  }

  let event;
  try {
    event = await provider.handleWebhook(req);
  } catch (error) {
    // Unsigned or tampered payloads never reach markPaid.
    console.error(`Webhook (${provider.name}) rejected:`, error.message);
    return res.status(400).send('Webhook Error');
  }

  try {
    if (event?.paid && event.reference) {
      const orderId = await markPaid(event.reference);
      console.log(
        orderId
          ? `Webhook (${provider.name}): order ${orderId} marked Paid`
          : `Webhook (${provider.name}): ${event.reference} already settled or has no order`
      );
    }
  } catch (error) {
    // Acknowledge anyway: providers retry on non-2xx, and a retry storm won't
    // fix a database problem on our side. The failure is in the logs.
    console.error('Webhook handling error:', error);
  }

  res.status(200).json({ received: true });
};
