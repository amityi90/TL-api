const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const shippingController = require('../controllers/shippingController');

// Each quote is a call to the rates provider, which is metered and rate
// limited on its side. The storefront debounces, so a real shopper stays far
// below this; it exists to stop a script hammering the endpoint.
const ratesLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many shipping requests. Please try again in a few minutes.' }
});

router.post('/rates', ratesLimiter, shippingController.getRates);

module.exports = router;
