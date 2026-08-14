const Joi = require('joi');
const { query } = require('../db');

// The old version had no validation, so a malformed email surfaced as a 500
// from the schema layer instead of a 400.
const contactSchema = Joi.object({
  name: Joi.string().trim().min(1).max(200).required(),
  email: Joi.string().trim().email().max(320).required(),
  subject: Joi.string().trim().min(1).max(200).required(),
  message: Joi.string().trim().min(1).max(5000).required()
});

exports.submitContactForm = async (req, res, next) => {
  try {
    const { error, value } = contactSchema.validate(req.body || {});
    if (error) {
      return res.status(400).json({ success: false, message: error.details[0].message });
    }

    await query(
      'INSERT INTO messages (name, email, subject, message) VALUES ($1, $2, $3, $4)',
      [value.name, value.email, value.subject, value.message]
    );

    res.status(201).json({
      success: true,
      data: { message: 'Message sent successfully' }
    });
  } catch (error) {
    next(error);
  }
};
