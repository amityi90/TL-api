// Cart and address validation shared by POST /api/shipping/rates and
// POST /api/orders, so a quote is always computed from exactly what the order
// will later be checked against.

const Joi = require('joi');

const cartItemsSchema = Joi.array()
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
  .min(1);

const shippingAddressSchema = Joi.object({
  fullName: Joi.string().required(),
  address: Joi.string().required(),
  city: Joi.string().required(),
  // State / province / region. Couriers require it for US, CA, MX and AU.
  state: Joi.string().trim().allow('').max(100).optional(),
  postalCode: Joi.string().required(),
  // ISO 3166-1 alpha-2, from the storefront's country select.
  country: Joi.string().trim().uppercase().length(2).optional(),
  phone: Joi.string().required(),
  email: Joi.string().email().optional()
})
  .unknown(true)
  .required();

/**
 * Cart lines -> productId => quantity, with duplicate lines summed. Returns
 * null when an id is not an integer.
 */
const mergeCart = (cartItems) => {
  const quantityByProductId = new Map();
  for (const item of cartItems) {
    const productId = Number(item.id ?? item._id);
    if (!Number.isInteger(productId)) return null;
    quantityByProductId.set(productId, (quantityByProductId.get(productId) || 0) + item.quantity);
  }
  return quantityByProductId;
};

module.exports = { cartItemsSchema, shippingAddressSchema, mergeCart };
