const { test } = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../services/shipping/mock/engine');
const { SERVICES } = require('../services/shipping/mock/rateTable');
const quotes = require('../services/shipping/quotes');

const parcel = (kg, box = { length: 10, width: 10, height: 5 }) => ({
  total_actual_weight: kg,
  box,
  items: [{ quantity: 1 }]
});

test('zones: known countries map to their zone, the rest to REST_OF_WORLD', () => {
  assert.equal(engine.zoneFor('IL'), 'IL_DOMESTIC');
  assert.equal(engine.zoneFor('de'), 'EUROPE');
  assert.equal(engine.zoneFor('US'), 'NORTH_AMERICA');
  assert.equal(engine.zoneFor('AE'), 'MIDDLE_EAST');
  assert.equal(engine.zoneFor('JP'), 'REST_OF_WORLD');
});

test('billable weight: the heavier of actual and volumetric, rounded up to 0.5 kg', () => {
  // 0.2 kg actual, tiny box -> minimum step
  assert.equal(engine.billableWeight({ actualKg: 0.2, volumeCm3: 500 }), 0.5);
  // 1.1 kg actual beats 1000 cm3 / 5000 = 0.2 kg -> 1.5
  assert.equal(engine.billableWeight({ actualKg: 1.1, volumeCm3: 1000 }), 1.5);
  // 40x30x20 = 24000 cm3 -> 4.8 kg volumetric beats 1 kg actual -> 5.0
  assert.equal(engine.billableWeight({ actualKg: 1, volumeCm3: 24000 }), 5);
  // exactly on a step does not round up
  assert.equal(engine.billableWeight({ actualKg: 1, volumeCm3: 0 }), 1);
});

test('measureParcel: falls back to item weights and dimensions when there is no box', () => {
  const measured = engine.measureParcel({
    items: [
      { quantity: 2, actual_weight: 0.1, dimensions: { length: 5, width: 5, height: 2 } },
      { quantity: 1, actual_weight: 0.3, dimensions: { length: 10, width: 5, height: 2 } }
    ]
  });
  assert.equal(Math.round(measured.actualKg * 100) / 100, 0.5);
  assert.equal(measured.volumeCm3, 200);
});

test('quote: base for the first 0.5 kg, perHalfKg per extra step, plus fuel surcharge', () => {
  const dhl = SERVICES.find((s) => s.id === 'mock-dhl-express-worldwide');
  const tariff = dhl.zones.NORTH_AMERICA;

  const light = engine.quote({ destinationCountry: 'US', parcels: [parcel(0.4)] });
  const lightDhl = light.find((r) => r.service.id === dhl.id);
  assert.equal(lightDhl.shipmentCharge, tariff.base);
  assert.equal(lightDhl.fuelSurcharge, Math.round(tariff.base * dhl.fuelPct * 100) / 100);
  assert.equal(lightDhl.totalCharge, Math.round((tariff.base * (1 + dhl.fuelPct)) * 100) / 100);
  assert.equal(lightDhl.minDays, tariff.minDays);
  assert.equal(lightDhl.maxDays, tariff.maxDays);

  // 1.2 kg -> 1.5 kg billable -> two steps beyond the first half kilo
  const heavier = engine.quote({ destinationCountry: 'US', parcels: [parcel(1.2)] });
  const heavierDhl = heavier.find((r) => r.service.id === dhl.id);
  assert.equal(heavierDhl.shipmentCharge, tariff.base + 2 * tariff.perHalfKg);
});

test('quote: only services priced for the zone are offered, cheapest first', () => {
  const domestic = engine.quote({ destinationCountry: 'IL', parcels: [parcel(0.5)] });
  const expectedIds = SERVICES.filter((s) => s.zones.IL_DOMESTIC).map((s) => s.id);
  assert.deepEqual(domestic.map((r) => r.service.id).sort(), expectedIds.sort());

  const europe = engine.quote({ destinationCountry: 'FR', parcels: [parcel(0.5)] });
  const totals = europe.map((r) => r.totalCharge);
  assert.deepEqual(totals, [...totals].sort((a, b) => a - b));
});

test('quote fingerprint: tied to destination and cart, not to name or formatting', () => {
  const cart = new Map([[3, 1], [1, 2]]);
  const address = { address: '500 Congress Ave', city: 'Austin', state: 'TX', postalCode: '78701', country: 'US' };
  const base = quotes.fingerprint(address, cart);

  // Case, spacing and contact details do not matter
  assert.equal(
    quotes.fingerprint({ ...address, address: ' 500  congress ave ', postalCode: '787 01', fullName: 'X' }, new Map([[1, 2], [3, 1]])),
    base
  );
  // A different postal code or cart does
  assert.notEqual(quotes.fingerprint({ ...address, postalCode: '78702' }, cart), base);
  assert.notEqual(quotes.fingerprint(address, new Map([[3, 1], [1, 3]])), base);
});
