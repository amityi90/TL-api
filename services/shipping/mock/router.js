// A stand-in for Easyship's POST /2024-09/rates, mounted at /mock/easyship.
//
// It accepts and answers in Easyship's exact contract, so services/shipping/
// client.js cannot tell it apart from the real API: going live is a change of
// EASYSHIP_BASE_URL and EASYSHIP_API_TOKEN, nothing else. The rule that keeps
// that true - never add a field Easyship lacks, never drop one it has - is
// enforced by test/shipping-contract.test.js.

const express = require('express');
const Joi = require('joi');
const { randomUUID, timingSafeEqual } = require('crypto');
const engine = require('./engine');

const router = express.Router();

// Easyship requires a state for these destinations.
const STATE_REQUIRED = ['US', 'CA', 'MX', 'AU'];

const address = (role) =>
  Joi.object({
    line_1: Joi.string().trim().min(1).required(),
    line_2: Joi.string().allow('', null).optional(),
    state:
      role === 'destination'
        ? Joi.when('country_alpha2', {
            is: Joi.string().uppercase().valid(...STATE_REQUIRED),
            then: Joi.string().trim().min(1).required(),
            otherwise: Joi.string().allow('', null).optional()
          })
        : Joi.string().allow('', null).optional(),
    city: Joi.string().trim().min(1).required(),
    postal_code: Joi.string().trim().min(1).required(),
    country_alpha2: Joi.string().trim().uppercase().length(2).required(),
    contact_name: Joi.string().allow('', null).optional(),
    company_name: Joi.string().allow('', null).optional(),
    contact_phone: Joi.string().allow('', null).optional(),
    contact_email: Joi.string().allow('', null).optional()
  }).unknown(true);

const positive = Joi.number().positive();
const dimensions = Joi.object({
  length: positive.required(),
  width: positive.required(),
  height: positive.required()
}).unknown(true);

const item = Joi.object({
  quantity: Joi.number().integer().min(1).required(),
  actual_weight: positive.optional(),
  dimensions: dimensions.optional(),
  declared_currency: Joi.string().length(3).optional(),
  declared_customs_value: Joi.number().min(0).optional()
}).unknown(true);

const parcel = Joi.object({
  total_actual_weight: positive.optional(),
  box: dimensions.optional(),
  items: Joi.array().items(item).min(1).required()
})
  .unknown(true)
  .custom((value, helpers) => {
    const hasBox = value.total_actual_weight !== undefined && value.box !== undefined;
    const itemsMeasured = value.items.every((i) => i.actual_weight !== undefined && i.dimensions);
    return hasBox || itemsMeasured ? value : helpers.error('parcel.measurements');
  })
  .messages({
    'parcel.measurements':
      '{{#label}} needs total_actual_weight and box, or actual_weight and dimensions on every item'
  });

const rateRequestSchema = Joi.object({
  origin_address: address('origin').required(),
  destination_address: address('destination').required(),
  parcels: Joi.array().items(parcel).min(1).required()
}).unknown(true);

const easyshipError = (res, status, code, message, details = []) =>
  res.status(status).json({ error: { code, message, details } });

// Same Bearer scheme as Easyship. Without a configured token the mock refuses
// everyone rather than standing open on the public Cloud Run URL.
const requireToken = (req, res, next) => {
  const expected = process.env.SHIPPING_MOCK_TOKEN || '';
  const presented = (req.header('Authorization') || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (!expected || a.length !== b.length || !timingSafeEqual(a, b)) {
    return easyshipError(res, 401, 'unauthorized', 'Invalid or missing access token');
  }
  next();
};

// Fields and their order mirror Easyship's documented rate object. Tax and
// duty are null, exactly as the real API answers on a plan without that
// feature, so the client and storefront already handle the "no estimate" case.
const toEasyshipRate = (priced) => ({
  courier_service: {
    id: priced.service.id,
    name: priced.service.name,
    umbrella_name: priced.service.courier,
    courier_id: priced.service.courierId
  },
  currency: 'USD',
  shipment_charge: priced.shipmentCharge,
  fuel_surcharge: priced.fuelSurcharge,
  shipment_charge_total: priced.totalCharge,
  total_charge: priced.totalCharge,
  min_delivery_time: priced.minDays,
  max_delivery_time: priced.maxDays,
  incoterms: 'DDU',
  estimated_import_tax: null,
  estimated_import_duty: null,
  import_tax_charge: 0,
  import_duty_charge: 0,
  is_above_threshold: false,
  is_above_duty_threshold: false,
  description: 'Mock rate - static table',
  full_description: `${priced.service.name}, ${priced.minDays}-${priced.maxDays} business days`,
  rates_in_origin_currency: null
});

router.post('/2024-09/rates', requireToken, (req, res) => {
  const { error, value } = rateRequestSchema.validate(req.body || {}, { abortEarly: false });
  if (error) {
    return easyshipError(
      res,
      422,
      'invalid_content',
      'The request body is invalid',
      error.details.map((d) => d.message.replace(/"/g, ''))
    );
  }

  const rates = engine
    .quote({
      destinationCountry: value.destination_address.country_alpha2,
      parcels: value.parcels
    })
    .map(toEasyshipRate);

  res.status(200).json({
    rates,
    meta: {
      pagination: { page: 1, next: null, count: rates.length },
      request_id: `mock-${randomUUID()}`
    }
  });
});

module.exports = router;
