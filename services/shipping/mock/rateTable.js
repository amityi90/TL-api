// The static price list behind the mock rates endpoint.
//
// These are real prices: until EASYSHIP_BASE_URL is pointed at Easyship, what
// this table says is what the customer pays at checkout. The figures below are
// placeholders - replace them with the shop's actual courier tariffs.
//
// All amounts are USD. `base` covers the first 0.5 kg of billable weight and
// `perHalfKg` each further 0.5 kg. A service with no entry for a zone is simply
// not offered there.

// Countries per zone. Anything not listed falls into REST_OF_WORLD. The origin
// is Israel, so IL is domestic.
const ZONES = {
  IL_DOMESTIC: ['IL'],
  EUROPE: [
    'AT', 'BE', 'BG', 'CH', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GB', 'GR', 'HR',
    'HU', 'IE', 'IS', 'IT', 'LI', 'LT', 'LU', 'LV', 'MC', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO',
    'SE', 'SI', 'SK'
  ],
  NORTH_AMERICA: ['US', 'CA', 'MX'],
  MIDDLE_EAST: ['AE', 'BH', 'EG', 'JO', 'KW', 'MA', 'OM', 'QA', 'SA', 'TR']
};

const DEFAULT_ZONE = 'REST_OF_WORLD';

const SERVICES = [
  {
    id: 'mock-israel-post-registered',
    courierId: 'mock-israel-post',
    courier: 'Israel Post',
    name: 'Israel Post Registered Airmail',
    fuelPct: 0,
    zones: {
      IL_DOMESTIC: { base: 6, perHalfKg: 1, minDays: 1, maxDays: 3 },
      EUROPE: { base: 18, perHalfKg: 3, minDays: 7, maxDays: 14 },
      NORTH_AMERICA: { base: 22, perHalfKg: 4, minDays: 10, maxDays: 18 },
      MIDDLE_EAST: { base: 16, perHalfKg: 3, minDays: 7, maxDays: 14 },
      REST_OF_WORLD: { base: 25, perHalfKg: 5, minDays: 10, maxDays: 21 }
    }
  },
  {
    id: 'mock-israel-post-ems',
    courierId: 'mock-israel-post',
    courier: 'Israel Post',
    name: 'Israel Post EMS',
    fuelPct: 0,
    zones: {
      EUROPE: { base: 32, perHalfKg: 5, minDays: 4, maxDays: 8 },
      NORTH_AMERICA: { base: 38, perHalfKg: 6, minDays: 5, maxDays: 9 },
      MIDDLE_EAST: { base: 28, perHalfKg: 4, minDays: 4, maxDays: 8 },
      REST_OF_WORLD: { base: 42, perHalfKg: 7, minDays: 6, maxDays: 12 }
    }
  },
  {
    id: 'mock-dhl-express-worldwide',
    courierId: 'mock-dhl',
    courier: 'DHL',
    name: 'DHL Express Worldwide',
    fuelPct: 0.18,
    zones: {
      EUROPE: { base: 38, perHalfKg: 6, minDays: 2, maxDays: 4 },
      NORTH_AMERICA: { base: 45, perHalfKg: 7, minDays: 3, maxDays: 5 },
      MIDDLE_EAST: { base: 34, perHalfKg: 5, minDays: 2, maxDays: 4 },
      REST_OF_WORLD: { base: 55, perHalfKg: 9, minDays: 3, maxDays: 6 }
    }
  },
  {
    id: 'mock-ups-worldwide-saver',
    courierId: 'mock-ups',
    courier: 'UPS',
    name: 'UPS Worldwide Saver',
    fuelPct: 0.16,
    zones: {
      EUROPE: { base: 40, perHalfKg: 6, minDays: 2, maxDays: 4 },
      NORTH_AMERICA: { base: 44, perHalfKg: 7, minDays: 2, maxDays: 4 },
      REST_OF_WORLD: { base: 58, perHalfKg: 9, minDays: 3, maxDays: 6 }
    }
  }
];

module.exports = { ZONES, DEFAULT_ZONE, SERVICES };
