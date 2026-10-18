// Server-held shipping quotes. The storefront only ever sends back a quote id
// and a rate id; the price is read from here, so the browser has no say in
// what shipping costs - the same rule that already applies to item prices.

const { createHash, randomUUID } = require('crypto');

const ttlMinutes = () => {
  const value = Number(process.env.SHIPPING_QUOTE_TTL_MINUTES);
  return Number.isFinite(value) && value > 0 ? value : 30;
};

const clean = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

/**
 * What a quote is valid for: the destination and the exact cart. The cart is
 * included because its value is declared to the courier and drives duty.
 * Name, phone and email are left out - editing them does not change the price.
 */
const fingerprint = (shippingAddress, quantityByProductId) => {
  const destination = {
    address: clean(shippingAddress.address),
    city: clean(shippingAddress.city),
    state: clean(shippingAddress.state),
    postalCode: clean(shippingAddress.postalCode).replace(/\s/g, ''),
    country: clean(shippingAddress.country).toUpperCase()
  };
  const cart = [...quantityByProductId.entries()]
    .sort(([a], [b]) => a - b)
    .map(([id, quantity]) => `${id}x${quantity}`)
    .join(',');
  return createHash('sha256').update(JSON.stringify({ destination, cart })).digest('hex');
};

const saveQuote = async (db, { fingerprint: print, rates }) => {
  // Housekeeping on the write path, so no scheduler is needed.
  await db.query('DELETE FROM shipping_quotes WHERE expires_at < now()');
  const id = randomUUID();
  const { rows } = await db.query(
    `INSERT INTO shipping_quotes (id, fingerprint, rates, expires_at)
     VALUES ($1, $2, $3, now() + make_interval(mins => $4::int))
     RETURNING id, expires_at AS "expiresAt"`,
    [id, print, JSON.stringify(rates), Math.round(ttlMinutes())]
  );
  return rows[0];
};

/**
 * The stored rate behind (quoteId, rateId), or null when the quote is
 * unknown, expired, issued for a different address or cart, or never
 * offered that rate.
 */
const resolveRate = async (db, { quoteId, rateId, fingerprint: print }) => {
  const { rows } = await db.query(
    `SELECT rates FROM shipping_quotes
      WHERE id = $1 AND fingerprint = $2 AND expires_at > now()`,
    [quoteId, print]
  );
  if (rows.length === 0) return null;
  return rows[0].rates.find((rate) => rate.id === rateId) || null;
};

module.exports = { fingerprint, saveQuote, resolveRate };
