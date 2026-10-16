// Provider-neutral payment layer. paymentController talks only to this module,
// so adding a payment company later means writing one file next to manual.js
// and setting PAYMENT_PROVIDER - no controller or route changes.
//
// A provider implements:
//   name                     stored on the order as payment_provider
//   paymentMethod            value for orders.payment_method ('Card', 'PayPal', 'Manual')
//   startPayment(order)   -> { mode, reference?, clientData? }
//                            `mode` tells the storefront which payment UI to render;
//                            `reference` is saved as orders.payment_reference.
//   verifyPayment(order)  -> { paid, amountMinor?, status? }
//                            Ask the provider (never the browser) whether it was paid.
//   handleWebhook(req)    -> optional; resolves { reference, paid, amountMinor? } or null.
//                            req.body is the raw Buffer, for signature checks.
//
// Orders carry amounts in dollars. Convert with toMinorUnits only at the
// provider boundary.

const manual = require('./manual');

const PROVIDERS = { manual };

// The shop sells in US dollars only.
const CURRENCY = 'usd';

const toMinorUnits = (amount) => Math.round(Number(amount) * 100);

const getProvider = () => {
  const name = process.env.PAYMENT_PROVIDER || 'manual';
  const provider = PROVIDERS[name];
  if (!provider) {
    const error = new Error(`Unknown payment provider: ${name}`);
    error.status = 503;
    throw error;
  }
  return provider;
};

const findProvider = (name) =>
  Object.prototype.hasOwnProperty.call(PROVIDERS, name) ? PROVIDERS[name] : null;

module.exports = { CURRENCY, toMinorUnits, getProvider, findProvider };
