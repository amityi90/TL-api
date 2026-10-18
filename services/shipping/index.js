// Shipping rates for checkout. Controllers talk only to this module.
//
// SHIPPING_ENABLED=true  -> rates come from the Easyship-format client, pointed
//                           at the mock or the real API by EASYSHIP_BASE_URL.
// otherwise              -> one complimentary rate, which is how the shop has
//                           always behaved, so deploying this changes nothing
//                           until it is switched on.

const client = require('./client');

const isEnabled = () => process.env.SHIPPING_ENABLED === 'true';

const COMPLIMENTARY_RATE = {
  id: 'complimentary',
  carrier: 'Complimentary',
  service: 'Standard shipping',
  amount: 0,
  currency: 'USD',
  minDays: null,
  maxDays: null,
  estDuties: null
};

const getRates = (args) => (isEnabled() ? client.getRates(args) : Promise.resolve([COMPLIMENTARY_RATE]));

module.exports = { isEnabled, getRates, COMPLIMENTARY_RATE };
