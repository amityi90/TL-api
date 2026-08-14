const Joi = require('joi');
const { query } = require('../db');
const { PRODUCT_COLUMNS, ORDER_COLUMNS, ORDER_ITEMS_JSON } = require('../db/projections');

const CATEGORIES = ['Rings', 'Necklaces', 'Earrings', 'Bracelets', 'Watches', 'Other'];

const productSchema = Joi.object({
  name: Joi.string().trim().min(1).max(200).required(),
  description: Joi.string().trim().min(1).required(),
  price: Joi.number().min(0).required(),
  images: Joi.array().items(Joi.string().trim().uri()).default([]),
  category: Joi.string().valid(...CATEGORIES).required(),
  material: Joi.string().trim().min(1).max(200).required(),
  stockCount: Joi.number().integer().min(0).default(10)
});

const parseId = (raw) => {
  const id = Number(raw);
  return Number.isInteger(id) ? id : null;
};

// --- Product Management ---

exports.createProduct = async (req, res, next) => {
  try {
    const { error, value } = productSchema.validate(req.body || {}, { stripUnknown: true });
    if (error) {
      return res.status(400).json({ success: false, message: error.details[0].message });
    }

    const { rows } = await query(
      `INSERT INTO products (name, description, price, images, category, material, stock_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${PRODUCT_COLUMNS}`,
      [
        value.name,
        value.description,
        value.price,
        value.images,
        value.category,
        value.material,
        value.stockCount
      ]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (error) {
    next(error);
  }
};

exports.getAllProducts = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT ${PRODUCT_COLUMNS} FROM products ORDER BY created_at DESC`
    );
    res.status(200).json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
};

exports.updateProduct = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) {
      return res.status(400).json({ success: false, message: 'Invalid product id' });
    }

    // Partial update: validate only the keys that were actually sent.
    const { error, value } = productSchema
      .fork(Object.keys(productSchema.describe().keys), (field) => field.optional())
      .validate(req.body || {}, { stripUnknown: true, noDefaults: true });
    if (error) {
      return res.status(400).json({ success: false, message: error.details[0].message });
    }

    const columnByField = {
      name: 'name',
      description: 'description',
      price: 'price',
      images: 'images',
      category: 'category',
      material: 'material',
      stockCount: 'stock_count'
    };

    const assignments = [];
    const params = [];
    for (const [field, column] of Object.entries(columnByField)) {
      if (value[field] !== undefined) {
        params.push(value[field]);
        assignments.push(`${column} = $${params.length}`);
      }
    }

    if (assignments.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    params.push(id);
    const { rows } = await query(
      `UPDATE products SET ${assignments.join(', ')}
        WHERE id = $${params.length}
        RETURNING ${PRODUCT_COLUMNS}`,
      params
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    next(error);
  }
};

exports.deleteProduct = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) {
      return res.status(400).json({ success: false, message: 'Invalid product id' });
    }

    // order_items.product_id is ON DELETE SET NULL, so historical orders keep
    // their name and unit_price snapshot instead of dangling.
    const { rows } = await query('DELETE FROM products WHERE id = $1 RETURNING id', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    res.status(200).json({ success: true, message: 'Product deleted' });
  } catch (error) {
    next(error);
  }
};

// --- Order Pipeline ---

exports.getAllOrders = async (req, res, next) => {
  try {
    const { status } = req.query;
    const params = [];
    let where = '';
    if (status) {
      params.push(status);
      where = `WHERE o.status = $${params.length}`;
    }

    const { rows } = await query(
      `SELECT ${ORDER_COLUMNS}, ${ORDER_ITEMS_JSON}
         FROM orders o
         ${where}
        ORDER BY o.created_at DESC`,
      params
    );
    res.status(200).json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
};

// Each transition asserts the current state in the WHERE clause, so an order
// cannot jump backwards (archived -> shipped) the way it could before.
const transition = async (req, res, next, { from, to, extraColumns = {}, validate }) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) {
      return res.status(400).json({ success: false, message: 'Invalid order id' });
    }

    if (validate) {
      const message = validate(req.body || {});
      if (message) {
        return res.status(400).json({ success: false, message });
      }
    }

    const params = [];
    const assignments = [];
    for (const [column, value] of Object.entries(extraColumns)) {
      params.push(value);
      assignments.push(`${column} = $${params.length}`);
    }
    params.push(to);
    assignments.push(`status = $${params.length}`);
    params.push(id);
    params.push(from);

    const { rows } = await query(
      `UPDATE orders SET ${assignments.join(', ')}
        WHERE id = $${params.length - 1} AND status = $${params.length}
        RETURNING id`,
      params
    );

    if (rows.length === 0) {
      const { rows: existing } = await query('SELECT status FROM orders WHERE id = $1', [id]);
      if (existing.length === 0) {
        return res.status(404).json({ success: false, message: 'Order not found' });
      }
      return res.status(409).json({
        success: false,
        message: `Cannot move order from '${existing[0].status}' to '${to}'`
      });
    }

    const { rows: full } = await query(
      `SELECT ${ORDER_COLUMNS}, ${ORDER_ITEMS_JSON} FROM orders o WHERE o.id = $1`,
      [id]
    );
    res.status(200).json({ success: true, data: full[0] });
  } catch (error) {
    next(error);
  }
};

exports.shipOrder = (req, res, next) => {
  const { carrier, trackingNumber } = req.body || {};
  return transition(req, res, next, {
    from: 'pending',
    to: 'shipped',
    extraColumns: { carrier, tracking_number: trackingNumber },
    validate: () =>
      !carrier || !trackingNumber ? 'carrier and trackingNumber are required' : null
  });
};

exports.arriveOrder = (req, res, next) => {
  const body = req.body || {};
  // Accepts an ISO `arrivalAt`, or the legacy date + time pair.
  const raw = body.arrivalAt || [body.arrivalDate, body.arrivalTime].filter(Boolean).join('T');
  const arrivalAt = raw ? new Date(raw) : null;

  return transition(req, res, next, {
    from: 'shipped',
    to: 'arrived',
    extraColumns: { arrival_at: arrivalAt },
    validate: () =>
      !arrivalAt || Number.isNaN(arrivalAt.getTime())
        ? 'A valid arrivalAt (or arrivalDate and arrivalTime) is required'
        : null
  });
};

exports.archiveOrder = (req, res, next) =>
  transition(req, res, next, { from: 'arrived', to: 'archived' });
