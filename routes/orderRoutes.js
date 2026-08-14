const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const adminAuth = require('../middleware/adminAuth');

router.post('/', orderController.createOrder);

// Admin-only: this returns the customer's name, address and phone. It used to
// be public, so anyone holding an order id could read a stranger's details.
// No storefront screen calls it, so restricting it breaks nothing today.
router.get('/:id', adminAuth, orderController.getOrderById);

module.exports = router;
