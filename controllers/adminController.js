const Joi = require('joi');
const multer = require('multer');
const { randomUUID } = require('crypto');
const { query, withTransaction } = require('../db');
const { PRODUCT_COLUMNS, ORDER_COLUMNS, ORDER_ITEMS_JSON } = require('../db/projections');
const storage = require('../services/storage');

const CATEGORIES = ['Rings', 'Necklaces', 'Earrings', 'Bracelets', 'Watches', 'Other'];

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const MAX_FILES_PER_UPLOAD = 8;
// Cloud Run refuses HTTP/1 request bodies over 32 MiB before they reach the app, so
// MAX_FILES_PER_UPLOAD files at MAX_UPLOAD_BYTES each would be turned away by the
// platform with a 413 this handler never got to phrase. Cap the whole request under
// that, leaving headroom for multipart boundaries and headers.
const MAX_REQUEST_BYTES = 30 * 1024 * 1024;
const mb = (bytes) => Math.round(bytes / 1024 / 1024);
const EXT_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif'
};

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

// --- Site Content ---

const CONTENT_COLUMNS = `
  id,
  name,
  text,
  type,
  section,
  group_label AS "groupLabel",
  label,
  sort_order  AS "sortOrder",
  updated_at  AS "updatedAt"
`;

const contentUpdateSchema = Joi.object({
  updates: Joi.array()
    .items(
      Joi.object({
        name: Joi.string().required(),
        text: Joi.string().allow('').required()
      })
    )
    .min(1)
    .required()
});

exports.getSiteContent = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT ${CONTENT_COLUMNS} FROM site_content ORDER BY section, sort_order`
    );
    res.status(200).json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
};

exports.updateSiteContent = async (req, res, next) => {
  try {
    const { error, value } = contentUpdateSchema.validate(req.body || {}, { stripUnknown: true });
    if (error) {
      return res.status(400).json({ success: false, message: error.details[0].message });
    }

    const names = value.updates.map((u) => u.name);
    const { rows: existing } = await query(
      'SELECT name, text, type FROM site_content WHERE name = ANY($1::text[])',
      [names]
    );

    // Reject unknown keys outright rather than silently ignoring them - a typo
    // in the admin should be visible, not a save that appears to succeed.
    const known = new Map(existing.map((row) => [row.name, row]));
    const unknown = names.filter((name) => !known.has(name));
    if (unknown.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Unknown content key(s): ${unknown.join(', ')}`
      });
    }

    // Only `text` is writable. Everything else is structural and comes from the seed.
    await withTransaction(async (client) => {
      for (const update of value.updates) {
        await client.query(
          'UPDATE site_content SET text = $2, updated_at = now() WHERE name = $1',
          [update.name, update.text]
        );
      }
    });

    // Replaced images are removed from the bucket afterwards; deleteByUrls skips
    // anything outside our bucket, so the seeded Unsplash URLs pass through.
    const replaced = value.updates
      .filter((u) => known.get(u.name).type === 'image' && known.get(u.name).text !== u.text)
      .map((u) => known.get(u.name).text);
    if (replaced.length > 0) {
      await storage.deleteByUrls(replaced);
    }

    const { rows } = await query(
      `SELECT ${CONTENT_COLUMNS} FROM site_content ORDER BY section, sort_order`
    );
    res.status(200).json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
};

// --- Image Upload ---

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES }
}).array('files', MAX_FILES_PER_UPLOAD);

// multer runs inside the handler rather than as route middleware so its errors
// can be mapped to meaningful status codes instead of falling through as 500s.
exports.uploadImages = (req, res, next) => {
  // Checked before multer runs: memoryStorage() buffers the whole body in RAM, so an
  // oversized upload has to be refused from its header alone rather than after
  // parsing. A missing or unparseable Content-Length falls through to the per-file
  // limit below, which still bounds each individual file.
  const declaredBytes = Number(req.headers['content-length']);
  if (Number.isFinite(declaredBytes) && declaredBytes > MAX_REQUEST_BYTES) {
    return res.status(413).json({
      success: false,
      message: `Upload too large (max ${mb(MAX_REQUEST_BYTES)} MB per request)`
    });
  }

  upload(req, res, async (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({
            success: false,
            message: `Image too large (max ${mb(MAX_UPLOAD_BYTES)} MB)`
          });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({
            success: false,
            message: `Too many files (max ${MAX_FILES_PER_UPLOAD})`
          });
        }
      }
      return res.status(400).json({ success: false, message: 'Invalid upload' });
    }

    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ success: false, message: 'No file provided' });
    }

    for (const file of files) {
      if (!EXT_BY_MIME[file.mimetype]) {
        return res.status(400).json({
          success: false,
          message: 'Unsupported image type (use JPEG, PNG, WebP or GIF)'
        });
      }
    }

    try {
      const urls = await Promise.all(
        files.map((file) => {
          // Original filename is discarded: no sanitising to get wrong, no collisions.
          const key = `products/${randomUUID()}.${EXT_BY_MIME[file.mimetype]}`;
          return storage.uploadObject(key, file.buffer, file.mimetype);
        })
      );
      res.status(201).json({ success: true, data: { urls } });
    } catch (error) {
      next(error);
    }
  });
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

    // Capture the current images before overwriting them, so any that the edit
    // drops can be removed from the bucket afterwards.
    let previousImages = [];
    if (value.images !== undefined) {
      const { rows: before } = await query('SELECT images FROM products WHERE id = $1', [id]);
      previousImages = before[0]?.images || [];
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

    const stillUsed = new Set(rows[0].images || []);
    const removed = previousImages.filter((url) => !stillUsed.has(url));
    if (removed.length > 0) {
      await storage.deleteByUrls(removed);
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
    const { rows } = await query('DELETE FROM products WHERE id = $1 RETURNING id, images', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    // Skips anything we don't own — seeded products point at Unsplash.
    await storage.deleteByUrls(rows[0].images || []);

    res.status(200).json({ success: true, message: 'Product deleted' });
  } catch (error) {
    next(error);
  }
};

// --- Order Pipeline ---

const ORDER_STATUSES = ['pending', 'shipped', 'arrived', 'archived', 'cancelled'];

const fetchOrder = async (db, id) => {
  const { rows } = await db.query(
    `SELECT ${ORDER_COLUMNS}, ${ORDER_ITEMS_JSON} FROM orders o WHERE o.id = $1`,
    [id]
  );
  return rows[0] || null;
};

exports.getAllOrders = async (req, res, next) => {
  try {
    const { status } = req.query;
    const params = [];
    let where = '';
    if (status) {
      if (!ORDER_STATUSES.includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid status filter' });
      }
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

exports.getOrderById = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) {
      return res.status(400).json({ success: false, message: 'Invalid order id' });
    }
    const order = await fetchOrder({ query }, id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    res.status(200).json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

// Explains why a guarded UPDATE matched no row: missing order, wrong status,
// or (for shipping) not yet paid.
const rejectTransition = async (res, id, to, requirePaid) => {
  const { rows: existing } = await query('SELECT status, payment_status FROM orders WHERE id = $1', [
    id
  ]);
  if (existing.length === 0) {
    return res.status(404).json({ success: false, message: 'Order not found' });
  }
  if (requirePaid && existing[0].payment_status !== 'Paid') {
    return res.status(409).json({ success: false, message: 'Order is not paid yet' });
  }
  return res.status(409).json({
    success: false,
    message: `Cannot move order from '${existing[0].status}' to '${to}'`
  });
};

// Each transition asserts the current state in the WHERE clause, so an order
// cannot jump backwards (archived -> shipped) the way it could before.
const transition = async (
  req,
  res,
  next,
  { from, to, extraColumns = {}, validate, requirePaid = false }
) => {
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
          ${requirePaid ? "AND payment_status = 'Paid'" : ''}
        RETURNING id`,
      params
    );

    if (rows.length === 0) {
      return rejectTransition(res, id, to, requirePaid);
    }

    res.status(200).json({ success: true, data: await fetchOrder({ query }, id) });
  } catch (error) {
    next(error);
  }
};

exports.shipOrder = (req, res, next) => {
  const { carrier, trackingNumber } = req.body || {};
  return transition(req, res, next, {
    from: 'pending',
    to: 'shipped',
    // Nothing leaves the boutique before it is paid for.
    requirePaid: true,
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

// Payment is arranged by hand while the shop uses the manual provider, so the
// admin records it here. Idempotent, and refused for cancelled orders.
exports.markOrderPaid = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) {
      return res.status(400).json({ success: false, message: 'Invalid order id' });
    }

    const { rows } = await query(
      `UPDATE orders
          SET payment_status = 'Paid',
              payment_provider = COALESCE(payment_provider, 'manual')
        WHERE id = $1 AND status <> 'cancelled'
        RETURNING id`,
      [id]
    );
    if (rows.length === 0) {
      return rejectTransition(res, id, 'paid', false);
    }

    res.status(200).json({ success: true, data: await fetchOrder({ query }, id) });
  } catch (error) {
    next(error);
  }
};

// Pending -> cancelled, returning the reserved stock in the same transaction.
// Stock is taken when the order is placed, so without this an abandoned order
// would hold its pieces off the shelf forever.
exports.cancelOrder = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) {
      return res.status(400).json({ success: false, message: 'Invalid order id' });
    }

    const order = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `UPDATE orders SET status = 'cancelled'
          WHERE id = $1 AND status = 'pending'
          RETURNING id`,
        [id]
      );
      if (rows.length === 0) return null;

      // product_id is NULL for products deleted since; nothing to restock.
      await client.query(
        `UPDATE products p
            SET stock_count = p.stock_count + oi.quantity
           FROM order_items oi
          WHERE oi.order_id = $1 AND oi.product_id = p.id`,
        [id]
      );
      return fetchOrder(client, id);
    });

    if (!order) {
      return rejectTransition(res, id, 'cancelled', false);
    }
    res.status(200).json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};
