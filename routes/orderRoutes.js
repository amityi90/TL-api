const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');

router.post('/', orderController.createOrder);

// Reading a single order (customer name, address, phone) is admin-only and
// lives at GET /api/admin/orders/:id.

module.exports = router;
