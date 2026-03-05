const Order = require('../models/Order');
const Product = require('../models/Product');
const Joi = require('joi');

const orderValidationSchema = Joi.object({
  cartItems: Joi.array().items(
    Joi.object({
      _id: Joi.string().optional(),
      id: Joi.string().optional(),
      quantity: Joi.number().integer().min(1).required()
    }).unknown(true).or('_id', 'id')
  ).required().min(1),
  shippingAddress: Joi.object({
    fullName: Joi.string().required(),
    address: Joi.string().required(),
    city: Joi.string().required(),
    postalCode: Joi.string().required(),
    phone: Joi.string().required(),
    email: Joi.string().email().optional()
  }).required(),
  paymentMethod: Joi.string().valid('Card', 'PayPal').required(),
  total: Joi.number().optional()
});

exports.createOrder = async (req, res, next) => {
  console.log('Incoming Order Request:', req.body);
  try {
    // 1. Validate Input
    const { error, value } = orderValidationSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error.details[0].message });
    }

    const { cartItems, shippingAddress, paymentMethod } = value;
    let calculatedTotal = 0;
    const orderItems = [];

    // 2. Check Stock & Calculate Total
    for (const item of cartItems) {
      // Frontend sends _id or id depending on structure
      const productId = item._id || item.id;
      if (!productId) {
         return res.status(400).json({ success: false, message: 'Invalid product ID in cart' });
      }
      
      const product = await Product.findById(productId);
      
      if (!product) {
        return res.status(404).json({ success: false, message: `Product not found: ${productId}` });
      }

      if (product.stockCount < item.quantity) {
        return res.status(400).json({ success: false, message: `Insufficient stock for ${product.name}` });
      }

      calculatedTotal += product.price * item.quantity;
      
      orderItems.push({
        productId: product._id,
        quantity: item.quantity
      });
    }

    // 3. Create Order
    const order = new Order({
      items: orderItems,
      shipmentDetails: {
        fullName: shippingAddress.fullName,
        address: shippingAddress.address,
        city: shippingAddress.city,
        postalCode: shippingAddress.postalCode,
        phone: shippingAddress.phone
      },
      paymentInfo: {
        method: paymentMethod,
        status: 'Pending'
      },
      totalAmount: calculatedTotal,
      status: 'Processing'
    });

    await order.save();

    // 4. Update Stock
    const updatePromises = orderItems.map(item => {
      return Product.findByIdAndUpdate(item.productId, {
        $inc: { stockCount: -item.quantity }
      });
    });

    await Promise.all(updatePromises);

    res.status(201).json({
      success: true,
      data: order
    });

  } catch (error) {
    next(error);
  }

  console.log('Create Order Request Body:', req.body);
};

exports.getOrderById = async (req, res, next) => {
  try {
    // Populate items.productId to get product details
    const order = await Order.findById(req.params.id)
      .populate('items.productId', 'name price images');
    
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    res.status(200).json({
      success: true,
      data: order
    });
  } catch (error) {
    next(error);
  }
};
