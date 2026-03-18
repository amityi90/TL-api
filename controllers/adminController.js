const Product = require('../models/Product');
const Order = require('../models/Order');

// --- Product Management ---

exports.createProduct = async (req, res, next) => {
  try {
    const product = new Product(req.body);
    await product.save();
    res.status(201).json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
};

exports.getAllProducts = async (req, res, next) => {
  try {
    const products = await Product.find();
    res.status(200).json({ success: true, data: products });
  } catch (error) {
    next(error);
  }
};

exports.updateProduct = async (req, res, next) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.status(200).json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
};

exports.deleteProduct = async (req, res, next) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.status(200).json({ success: true, message: 'Product deleted' });
  } catch (error) {
    next(error);
  }
};

// --- Order Pipeline ---

exports.getAllOrders = async (req, res, next) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: orders });
  } catch (error) {
    next(error);
  }
};

// Update status to 'delivered' with carrier info
exports.shipOrder = async (req, res, next) => {
  try {
    const { carrier, trackingNumber } = req.body;
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      {
        status: 'delivered',
        'deliveryInfo.carrier': carrier,
        'deliveryInfo.trackingNumber': trackingNumber
      },
      { new: true }
    );
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    res.status(200).json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

// Update status to 'arrived' with time info
exports.arriveOrder = async (req, res, next) => { // Fixed function name from createOrder to arriveOrder
  try {
    const { arrivalDate, arrivalTime } = req.body;
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      {
        status: 'arrived',
        'deliveryInfo.arrivalDate': arrivalDate,
        'deliveryInfo.arrivalTime': arrivalTime
      },
      { new: true }
    );
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    res.status(200).json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

// Update status to 'archived'
exports.archiveOrder = async (req, res, next) => {
  try {
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status: 'archived' },
      { new: true }
    );
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    res.status(200).json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};
