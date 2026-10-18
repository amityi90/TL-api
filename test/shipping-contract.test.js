// Guards the one promise the shipping design rests on: the mock speaks
// Easyship's rates API exactly, so switching EASYSHIP_BASE_URL to the real
// service needs no code change.
//
// fixtures/easyship-rates.sample.json is built from Easyship's documented
// v2024-09 rate object. Replace it with a response recorded from the Easyship
// sandbox once an account exists, and this test will flag any drift.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fixture = require('./fixtures/easyship-rates.sample.json');
const mockRouter = require('../services/shipping/mock/router');
const client = require('../services/shipping/client');

const TOKEN = 'test-mock-token';
let server;
let baseUrl;

before(async () => {
  process.env.SHIPPING_MOCK_TOKEN = TOKEN;
  process.env.SHIP_FROM_LINE1 = '1 Rothschild Blvd';
  process.env.SHIP_FROM_CITY = 'Tel Aviv';
  process.env.SHIP_FROM_POSTAL_CODE = '6688101';
  const app = express();
  app.use(express.json());
  app.use('/mock/easyship', mockRouter);
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/mock/easyship`;
});

after(() => new Promise((resolve) => server.close(resolve)));

const storefrontAddress = {
  fullName: 'Jane Doe',
  address: '500 Congress Ave',
  city: 'Austin',
  state: 'TX',
  postalCode: '78701',
  country: 'US',
  phone: '+1 512 555 0100',
  email: 'jane@example.com'
};

const postRates = (body, token = TOKEN) =>
  fetch(`${baseUrl}/2024-09/rates`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

// "a.b.c" -> type, for every leaf. Arrays are described by their first element.
const shape = (value, prefix = '', out = {}) => {
  if (Array.isArray(value)) {
    out[prefix] = 'array';
    if (value.length > 0) shape(value[0], `${prefix}[]`, out);
  } else if (value !== null && typeof value === 'object') {
    if (prefix) out[prefix] = 'object';
    for (const [key, child] of Object.entries(value)) {
      shape(child, prefix ? `${prefix}.${key}` : key, out);
    }
  } else {
    out[prefix] = value === null ? 'null' : typeof value;
  }
  return out;
};

// null in either one stands for "no value on this account/tier", which the
// real API does for tax and duty, so it is compatible with any type.
const compatible = (a, b) => a === b || a === 'null' || b === 'null';

test('mock response has exactly the fields of an Easyship response, with compatible types', async () => {
  const response = await postRates(client.buildRateRequest({ to: storefrontAddress, declaredValue: 1250 }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(body.rates.length > 0, 'mock returned no rates for a US destination');

  const expected = shape(fixture);
  const actual = shape(body);

  const missing = Object.keys(expected).filter((path) => !(path in actual));
  const extra = Object.keys(actual).filter((path) => !(path in expected));
  assert.deepEqual(missing, [], `mock is missing Easyship fields: ${missing.join(', ')}`);
  assert.deepEqual(extra, [], `mock returns fields Easyship lacks: ${extra.join(', ')}`);

  for (const path of Object.keys(expected)) {
    assert.ok(
      compatible(expected[path], actual[path]),
      `${path}: Easyship has ${expected[path]}, mock has ${actual[path]}`
    );
  }
});

test('the client normalizes the mock and the real payload into the same shape', async () => {
  const response = await postRates(client.buildRateRequest({ to: storefrontAddress, declaredValue: 1250 }));
  const fromMock = client.normalizeRates(await response.json());
  const fromEasyship = client.normalizeRates(fixture);

  assert.ok(fromMock.length > 0 && fromEasyship.length > 0);
  const keys = (rate) => Object.keys(rate).sort();
  assert.deepEqual(keys(fromMock[0]), keys(fromEasyship[0]));
  for (const key of keys(fromEasyship[0])) {
    assert.ok(
      compatible(
        fromMock[0][key] === null ? 'null' : typeof fromMock[0][key],
        fromEasyship[0][key] === null ? 'null' : typeof fromEasyship[0][key]
      ),
      `normalized ${key} differs in type`
    );
  }
  // Duties are summed when the provider estimates them, null otherwise.
  assert.equal(fromEasyship[0].estDuties, 81.25);
  assert.equal(fromMock[0].estDuties, null);
});

test('mock rejects a missing or wrong token with 401, like Easyship', async () => {
  const body = client.buildRateRequest({ to: storefrontAddress, declaredValue: 100 });
  const response = await postRates(body, 'wrong-token');
  assert.equal(response.status, 401);
  const payload = await response.json();
  assert.equal(payload.error.code, 'unauthorized');
});

test('mock answers an invalid request with an Easyship-style 422', async () => {
  const body = client.buildRateRequest({
    to: { ...storefrontAddress, state: '' },
    declaredValue: 100
  });
  const response = await postRates(body);
  assert.equal(response.status, 422);
  const payload = await response.json();
  assert.equal(payload.error.code, 'invalid_content');
  assert.ok(payload.error.details.some((d) => d.includes('destination_address.state')));
});
