// Easyship rates client. Written once, against Easyship's real v2024-09
// contract, and pointed by EASYSHIP_BASE_URL at either the in-repo mock
// (services/shipping/mock) or https://public-api.easyship.com. It must never
// branch on which one it is talking to - that is what makes the switch a pure
// configuration change.
//
// Global fetch, like services/email.js: Node 22 ships it, so no SDK.

const REQUEST_TIMEOUT_MS = 10000;
const MAX_RATES = 5;

const baseUrl = () => (process.env.EASYSHIP_BASE_URL || '').replace(/\/$/, '');

const numberFromEnv = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const httpError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const unavailable = () => httpError(503, 'Shipping rates are unavailable right now. Please try again shortly.');

// The boutique. Israel unless configured otherwise.
const originAddress = () => ({
  line_1: process.env.SHIP_FROM_LINE1 || '',
  city: process.env.SHIP_FROM_CITY || '',
  postal_code: process.env.SHIP_FROM_POSTAL_CODE || '',
  country_alpha2: (process.env.SHIP_FROM_COUNTRY || 'IL').toUpperCase(),
  contact_name: process.env.SHIP_FROM_NAME || 'Tehila Levi',
  contact_phone: process.env.SHIP_FROM_PHONE || '',
  contact_email: process.env.SHIP_FROM_EMAIL || ''
});

// Every order ships in the same box, so one parcel describes them all.
const parcelBox = () => ({
  length: numberFromEnv('PARCEL_LENGTH_CM', 15),
  width: numberFromEnv('PARCEL_WIDTH_CM', 12),
  height: numberFromEnv('PARCEL_HEIGHT_CM', 8)
});

/** Builds an Easyship rate request from a storefront shipping address. */
const buildRateRequest = ({ to, declaredValue }) => ({
  origin_address: originAddress(),
  destination_address: {
    line_1: to.address,
    state: to.state || undefined,
    city: to.city,
    postal_code: to.postalCode,
    country_alpha2: String(to.country || '').toUpperCase(),
    // Quotes are requested before the customer has necessarily typed a name.
    contact_name: to.fullName || 'Customer',
    contact_phone: to.phone || undefined,
    contact_email: to.email || undefined
  },
  parcels: [
    {
      total_actual_weight: numberFromEnv('PARCEL_WEIGHT_KG', 0.5),
      box: parcelBox(),
      items: [
        {
          description: 'Fine jewelry',
          category: process.env.PARCEL_ITEM_CATEGORY || 'jewelry',
          quantity: 1,
          declared_currency: 'USD',
          declared_customs_value: Math.round(Number(declaredValue) * 100) / 100,
          origin_country_alpha2: (process.env.SHIP_FROM_COUNTRY || 'IL').toUpperCase()
        }
      ]
    }
  ]
});

const sumOrNull = (...values) => {
  const present = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  return present.length ? Math.round(present.reduce((a, b) => a + b, 0) * 100) / 100 : null;
};

/**
 * Easyship rates -> the storefront's shape. Non-USD rates are dropped: the
 * shop charges in dollars only, and converting here would quietly re-price.
 */
const normalizeRates = (payload) => {
  const rates = Array.isArray(payload?.rates) ? payload.rates : [];
  return rates
    .filter((rate) => rate?.courier_service?.id && String(rate.currency).toUpperCase() === 'USD')
    .map((rate) => ({
      id: String(rate.courier_service.id),
      carrier: rate.courier_service.umbrella_name || rate.courier_service.name || 'Courier',
      service: rate.courier_service.name || '',
      amount: Math.round(Number(rate.total_charge) * 100) / 100,
      currency: 'USD',
      minDays: Number.isFinite(rate.min_delivery_time) ? rate.min_delivery_time : null,
      maxDays: Number.isFinite(rate.max_delivery_time) ? rate.max_delivery_time : null,
      estDuties: sumOrNull(rate.estimated_import_tax, rate.estimated_import_duty)
    }))
    .filter((rate) => Number.isFinite(rate.amount) && rate.amount >= 0)
    .sort((a, b) => a.amount - b.amount)
    .slice(0, MAX_RATES);
};

/** Live rates for a destination, cheapest first. Throws with .status set. */
const getRates = async ({ to, declaredValue }) => {
  const url = baseUrl();
  const token = process.env.EASYSHIP_API_TOKEN;
  if (!url || !token) {
    console.error('Shipping is enabled but EASYSHIP_BASE_URL or EASYSHIP_API_TOKEN is not set');
    throw unavailable();
  }
  // Otherwise the provider's 422 about our own address would be shown to the
  // customer as "please check your address".
  const origin = originAddress();
  if (!origin.line_1 || !origin.city || !origin.postal_code) {
    console.error('Shipping is enabled but SHIP_FROM_LINE1, SHIP_FROM_CITY or SHIP_FROM_POSTAL_CODE is not set');
    throw unavailable();
  }

  let response;
  try {
    response = await fetch(`${url}/2024-09/rates`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(buildRateRequest({ to, declaredValue })),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  } catch (error) {
    console.error('Shipping rates request failed:', error.message);
    throw unavailable();
  }

  const body = await response.json().catch(() => null);

  // 422 is Easyship rejecting what the customer typed (e.g. a postal code that
  // does not exist), so it goes back to them; anything else is our problem.
  if (response.status === 422) {
    const detail = body?.error?.details?.[0] || body?.error?.message;
    throw httpError(400, detail ? `Please check your address: ${detail}` : 'Please check your shipping address.');
  }
  if (!response.ok) {
    console.error(`Shipping rates rejected (${response.status}):`, JSON.stringify(body));
    throw unavailable();
  }

  return normalizeRates(body);
};

module.exports = { getRates, buildRateRequest, normalizeRates };
