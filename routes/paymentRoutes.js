const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');

router.post('/start', paymentController.startPayment);
router.post('/confirm', paymentController.confirmPayment);

// Note: /webhook/:provider is NOT mounted here. It needs the raw request body
// for signature verification, so server.js mounts it before express.json().

module.exports = router;
