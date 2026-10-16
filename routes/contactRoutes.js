const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const contactController = require('../controllers/contactController');

// Every accepted submission sends an email, so an open endpoint would be a
// free spam relay into the shop's inbox. Per-instance memory store: Cloud Run
// may run several instances, which loosens the limit but still stops a loop.
const contactLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many messages. Please try again in a few minutes.' }
});

router.post('/', contactLimiter, contactController.submitContactForm);

module.exports = router;
