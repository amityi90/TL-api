const Joi = require('joi');
const { query, withTransaction } = require('../db');
const { ORDER_COLUMNS, ORDER_ITEMS_JSON } = require('../db/projections');
const payments = require('../services/payments');
const { sendOrderNotification } = require('../services/email');

const orderValidationSchema = Joi.object({
  cartItems: Joi.array()
    .items(
      Joi.object({
        id: Joi.alternatives(Joi.number().integer(), Joi.string()).optional(),
        _id: Joi.alternatives(Joi.number().integer(), Joi.string()).optional(),
        quantity: Joi.number().integer().min(1).required()
      })
        .unknown(true)
        .or('id', '_id')
    )
    .required()
    .min(1),
  shippingAddress: Joi.object({
    fullName: Joi.string().required(),
    address: Joi.string().required(),
    city: Joi.string().required(),
    postalCode: Joi.string().required(),
    // ISO 3166-1 alpha-2, from the storefront's country select.
    country: Joi.string().trim().uppercase().length(2).optional(),
    phone: Joi.string().required(),
    email: Joi.string().email().optional()
  })
    .unknown(true)
    .required(),
  // Accepted for backwards compatibility but ignored: the active payment
  // provider decides the method, not the browser.
  paymentMethod: Joi.string().optional(),
  total: Joi.number().optional()
});

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

    const quantityByProductId = new Map();
    for (const item of cartItems) {
      const productId = Number(item.id ?? item._id);
      if (!Number.isInteger(productId)) {
        return res.status(400).json({ success: false, message: 'Invalid product ID in cart' });
      }
      // Same product listed twice: sum rather than let the later line win.
      quantityByProductId.set(
        productId,
        (quantityByProductId.get(productId) || 0) + item.quantity
      );
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

      const lineItems = productIds.map((productId) => ({
        productId,
        quantity: quantityByProductId.get(productId),
        unitPrice: productById.get(productId).price,
        name: productById.get(productId).name
      }));
      const totalAmount = lineItems.reduce(
        (sum, line) => sum + line.unitPrice * line.quantity,
        0
      );

      const { rows: orderRows } = await client.query(
        `INSERT INTO orders (full_name, address, city, postal_code, country, phone, email,
                             payment_method, total_amount)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          shippingAddress.fullName,
          shippingAddress.address,
          shippingAddress.city,
          shippingAddress.postalCode,
          shippingAddress.country || null,
          shippingAddress.phone,
          shippingAddress.email || null,
          paymentMethod,
          totalAmount
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
