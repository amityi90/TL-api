const { query } = require('../db');
const { PRODUCT_COLUMNS } = require('../db/projections');

exports.getProducts = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT ${PRODUCT_COLUMNS} FROM products ORDER BY created_at DESC`
    );
    res.status(200).json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
};

exports.getProductById = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ success: false, message: 'Invalid product id' });
    }

    const { rows } = await query(
      `SELECT ${PRODUCT_COLUMNS} FROM products WHERE id = $1`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    next(error);
  }
};
