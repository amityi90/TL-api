const { query } = require('../db');

// Public. The storefront only needs name -> text, so collapse the metadata away
// and hand back a flat map it can look up directly.
exports.getContent = async (req, res, next) => {
  try {
    const { rows } = await query('SELECT name, text FROM site_content');
    const content = {};
    for (const row of rows) content[row.name] = row.text;
    res.status(200).json({ success: true, data: content });
  } catch (error) {
    next(error);
  }
};
