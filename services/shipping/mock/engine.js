// Pure pricing for the mock rates endpoint: no I/O, so it can be tested on its
// own and the router stays a thin translation layer.

const { ZONES, DEFAULT_ZONE, SERVICES } = require('./rateTable');

// Standard courier volumetric divisor for centimetres and kilograms.
const VOLUMETRIC_DIVISOR = 5000;
const WEIGHT_STEP_KG = 0.5;

const money = (value) => Math.round(value * 100) / 100;

const zoneFor = (countryAlpha2) => {
  const code = String(countryAlpha2 || '').toUpperCase();
  for (const [zone, countries] of Object.entries(ZONES)) {
    if (countries.includes(code)) return zone;
  }
  return DEFAULT_ZONE;
};

// Couriers charge on whichever is greater, the scale weight or the space the
// box takes up, rounded up to their next weight step.
const billableWeight = ({ actualKg, volumeCm3 }) => {
  const volumetricKg = volumeCm3 / VOLUMETRIC_DIVISOR;
  const heaviest = Math.max(actualKg, volumetricKg, WEIGHT_STEP_KG);
  // The epsilon keeps 1.0000000001 (float noise) from billing another step.
  return Math.ceil(heaviest / WEIGHT_STEP_KG - 1e-9) * WEIGHT_STEP_KG;
};

// Weight and volume of one Easyship-format parcel: the box when it is given,
// otherwise the sum of its items' own weights and dimensions.
const measureParcel = (parcel) => {
  if (parcel.total_actual_weight !== undefined && parcel.box) {
    const { length, width, height } = parcel.box;
    return { actualKg: parcel.total_actual_weight, volumeCm3: length * width * height };
  }
  return parcel.items.reduce(
    (sum, item) => {
      const { length, width, height } = item.dimensions;
      return {
        actualKg: sum.actualKg + item.actual_weight * item.quantity,
        volumeCm3: sum.volumeCm3 + length * width * height * item.quantity
      };
    },
    { actualKg: 0, volumeCm3: 0 }
  );
};

/**
 * Prices every service offered for the destination, cheapest first.
 * Each parcel is billed separately, as a courier would.
 */
const quote = ({ destinationCountry, parcels }) => {
  const zone = zoneFor(destinationCountry);
  const steps = parcels.map((parcel) => {
    const kg = billableWeight(measureParcel(parcel));
    return Math.round((kg - WEIGHT_STEP_KG) / WEIGHT_STEP_KG);
  });

  return SERVICES.filter((service) => service.zones[zone])
    .map((service) => {
      const tariff = service.zones[zone];
      const shipmentCharge = money(
        steps.reduce((sum, extra) => sum + tariff.base + tariff.perHalfKg * extra, 0)
      );
      const fuelSurcharge = money(shipmentCharge * service.fuelPct);
      return {
        service,
        zone,
        shipmentCharge,
        fuelSurcharge,
        totalCharge: money(shipmentCharge + fuelSurcharge),
        minDays: tariff.minDays,
        maxDays: tariff.maxDays
      };
    })
    .sort((a, b) => a.totalCharge - b.totalCharge);
};

module.exports = { zoneFor, billableWeight, measureParcel, quote, VOLUMETRIC_DIVISOR };
