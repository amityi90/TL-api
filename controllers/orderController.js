const Joi = require('joi');
const { query, withTransaction } = require('../db');
const { ORDER_COLUMNS, ORDER_ITEMS_JSON } = require('../db/projections');
const payments = require('../services/payments');
const shippingService = require('../services/shipping');
const quotes = require('../services/shipping/quotes');
const { sendOrderNotification } = require('../services/email');
const { cartItemsSchema, shippingAddressSchema, mergeCart } = require('../validation/checkout');

const orderValidationSchema = Joi.object({
  cartItems: cartItemsSchema,
  shippingAddress: shippingAddressSchema,
  // The customer's pick from POST /api/shipping/rates. Only ids: the price is
  // read from the stored quote, never from the browser.
  shipping: Joi.object({
    quoteId: Joi.string().guid().required(),
    rateId: Joi.string().max(200).required()
  }).optional(),
  // Accepted for backwards compatibility but ignored: the active payment
  // provider decides the method, not the browser.
  paymentMethod: Joi.string().optional(),
  total: Joi.number().optional()
});

// The storefront watches for this code and re-quotes instead of just showing
// an error, since the usual cause is a quote that timed out.
const shippingQuoteInvalid = {
  status: 400,
  body: {
    success: false,
    code: 'SHIPPING_QUOTE_INVALID',
    message: 'Shipping options have expired or changed. Please choose a shipping method again.'
  }
};

exports.createOrder = async (req, res, next) => {
  try {
    // stripUnknown drops client-supplied fields such as `status` - order state
    // is decided by the server, never by the browser.
    const { error, value } = orderValidationSchema.validate(req.body || {}, {
      stripUnknown: true
    });
    if (error) {
      return res.status(400).json({ success: false, message: error.details[0].message });
    }

    // The payment intent is created afterwards, from this order's own total -
    // which is why the browser never gets to say what the charge should be.
    const { cartItems, shippingAddress } = value;
    const { paymentMethod } = payments.getProvider();

    // Same product listed twice: summed rather than letting the later line win.
    const quantityByProductId = mergeCart(cartItems);
    if (!quantityByProductId) {
      return res.status(400).json({ success: false, message: 'Invalid product ID in cart' });
    }

    if (shippingService.isEnabled() && !value.shipping) {
      return res.status(400).json({ success: false, message: 'Please choose a shipping method.' });
    }

    // Ascending id order gives every concurrent order the same lock sequence,
    // which is what stops two transactions deadlocking against each other.
    const productIds = [...quantityByProductId.keys()].sort((a, b) => a - b);

    const result = await withTransaction(async (client) => {
      const { rows: products } = await client.query(
        `SELECT id, name, price, stock_count
           FROM products
          WHERE id = ANY($1::int[])
          ORDER BY id
          FOR UPDATE`,
        [productIds]
      );

      const productById = new Map(products.map((p) => [p.id, p]));

      for (const productId of productIds) {
        const product = productById.get(productId);
        if (!product) {
          return { status: 404, body: { success: false, message: `Product not found: ${productId}` } };
        }
        const quantity = quantityByProductId.get(productId);
        if (product.stock_count < quantity) {
          return {
            status: 400,
            body: { success: false, message: `Insufficient stock for ${product.name}` }
          };
        }
      }

      // With shipping off, a quote the storefront still sends is ignored and
      // shipping stays free - exactly the behaviour before shipping existed.
      let shipping = { amount: 0, carrier: null, service: null, rateRef: null, estDuties: null };
      if (shippingService.isEnabled()) {
        const rate = await quotes.resolveRate(client, {
          quoteId: value.shipping.quoteId,
          rateId: value.shipping.rateId,
          fingerprint: quotes.fingerprint(shippingAddress, quantityByProductId)
        });
        if (!rate) return shippingQuoteInvalid;
        shipping = {
          amount: rate.amount,
          carrier: rate.carrier,
          service: rate.service,
          rateRef: rate.id,
          estDuties: rate.estDuties
        };
      }

      const lineItems = productIds.map((productId) => ({
        productId,
        quantity: quantityByProductId.get(productId),
        unitPrice: productById.get(productId).price,
        name: productById.get(productId).name
      }));
      const itemsTotal = lineItems.reduce(
        (sum, line) => sum + line.unitPrice * line.quantity,
        0
      );
      const totalAmount = Math.round((itemsTotal + shipping.amount) * 100) / 100;

      const { rows: orderRows } = await client.query(
        `INSERT INTO orders (full_name, address, city, state, postal_code, country, phone, email,
                             payment_method, total_amount, shipping_amount, shipping_carrier,
                             shipping_service, shipping_rate_ref, shipping_est_duties)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         RETURNING id`,
        [
          shippingAddress.fullName,
          shippingAddress.address,
          shippingAddress.city,
          shippingAddress.state || null,
          shippingAddress.postalCode,
          shippingAddress.country || null,
          shippingAddress.phone,
          shippingAddress.email || null,
          paymentMethod,
          totalAmount,
          shipping.amount,
          shipping.carrier,
          shipping.service,
          shipping.rateRef,
          shipping.estDuties
        ]
      );
      const orderId = orderRows[0].id;

      for (const line of lineItems) {
        await client.query(
          `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price)
           VALUES ($1, $2, $3, $4, $5)`,
          [orderId, line.productId, line.name, line.quantity, line.unitPrice]
        );
        // The CHECK (stock_count >= 0) constraint is the last line of defence:
        // even if the FOR UPDATE check were bypassed, stock cannot go negative.
        await client.query(
          'UPDATE products SET stock_count = stock_count - $1 WHERE id = $2',
          [line.quantity, line.productId]
        );
      }

      const { rows } = await client.query(
        `SELECT ${ORDER_COLUMNS}, ${ORDER_ITEMS_JSON} FROM orders o WHERE o.id = $1`,
        [orderId]
      );
      return { status: 201, body: { success: true, data: rows[0] } };
    });

    // After the commit, so the order is already safe: sendOrderNotification
    // never throws and logs its own failures. Awaited rather than fired after
    // the response because Cloud Run throttles CPU once a response is sent,
    // which can leave a background request hanging.
    if (result.status === 201) {
      await sendOrderNotification(result.body.data);
    }

    res.status(result.status).json(result.body);
  } catch (error) {
    next(error);
  }
};
