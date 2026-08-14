// Column aliases keep the JSON contract the frontends already expect
// (camelCase), while the tables stay snake_case.

const PRODUCT_COLUMNS = `
  id,
  name,
  description,
  price,
  images,
  category,
  material,
  stock_count AS "stockCount",
  created_at  AS "createdAt"
`;

const ORDER_COLUMNS = `
  o.id,
  o.full_name         AS "fullName",
  o.address,
  o.city,
  o.postal_code       AS "postalCode",
  o.phone,
  o.email,
  o.carrier,
  o.tracking_number   AS "trackingNumber",
  o.arrival_at        AS "arrivalAt",
  o.payment_method    AS "paymentMethod",
  o.payment_status    AS "paymentStatus",
  o.payment_intent_id AS "paymentIntentId",
  o.total_amount      AS "totalAmount",
  o.status,
  o.created_at        AS "createdAt"
`;

// Line items are aggregated into a JSON array so a single query returns the
// whole order. Replaces Mongoose .populate().
const ORDER_ITEMS_JSON = `
  COALESCE(
    (
      SELECT json_agg(
               json_build_object(
                 'id', oi.id,
                 'productId', oi.product_id,
                 'quantity', oi.quantity,
                 'unitPrice', oi.unit_price,
                 'name', p.name,
                 'images', p.images
               ) ORDER BY oi.id
             )
      FROM order_items oi
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = o.id
    ),
    '[]'::json
  ) AS items
`;

module.exports = { PRODUCT_COLUMNS, ORDER_COLUMNS, ORDER_ITEMS_JSON };
