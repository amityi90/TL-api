const Joi = require('joi');
const { query } = require('../db');
const shipping = require('../services/shipping');
const quotes = require('../services/shipping/quotes');
const { cartItemsSchema, shippingAddressSchema, mergeCart } = require('../validation/checkout');

// A quote needs a country, which the order schema leaves optional for older
// storefront builds. The storefront quotes as soon as the address is complete,
// often before name, phone or email are filled in, so those may be blank here.
const rateRequestSchema = Joi.object({
  cartItems: cartItemsSchema,
  shippingAddress: shippingAddressSchema.keys({
    fullName: Joi.string().allow('').optional(),
    phone: Joi.string().allow('').optional(),
    email: Joi.string().allow('').optional(),
    country: Joi.string().trim().uppercase().length(2).required()
  })
});

/**
 * POST /api/shipping/rates
 *
 * Quotes shipping for a cart and address, and stores the result. The response
 * carries our normalized rates - never the provider's raw payload - so the
 * storefront is unaffected by which rates engine sits behind the client.
 */
exports.getRates = async (req, res, next) => {
  try {
    const { error, value } = rateRequestSchema.validate(req.body || {}, { stripUnknown: true });
    if (error) {
      return res.status(400).json({ success: false, message: error.details[0].message });
    }

    const quantityByProductId = mergeCart(value.cartItems);
    if (!quantityByProductId) {
      return res.status(400).json({ success: false, message: 'Invalid product ID in cart' });
    }

    // Declared to the courier for customs, so it is priced from the database
    // like the order itself.
    const productIds = [...quantityByProductId.keys()];
    const { rows: products } = await query(
      'SELECT id, price FROM products WHERE id = ANY($1::int[])',
      [productIds]
    );
    if (products.length !== productIds.length) {
      return res.status(404).json({ success: false, message: 'A product in your cart is no longer available' });
    }
    const declaredValue = products.reduce(
      (sum, p) => sum + p.price * quantityByProductId.get(p.id),
      0
    );

    const rates = await shipping.getRates({ to: value.shippingAddress, declaredValue });
    if (rates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'We do not ship to this destination yet. Please contact us to arrange delivery.'
      });
    }

    const quote = await quotes.saveQuote(
      { query },
      { fingerprint: quotes.fingerprint(value.shippingAddress, quantityByProductId), rates }
    );

    res.status(200).json({
      success: true,
      data: { quoteId: quote.id, expiresAt: quote.expiresAt, rates }
    });
  } catch (error) {
    next(error);
  }
};
