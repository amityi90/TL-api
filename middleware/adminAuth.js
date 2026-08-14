const jwt = require('jsonwebtoken');
const { query } = require('../db');

module.exports = async (req, res, next) => {
  const token = req.header('Authorization')?.replace(/^Bearer\s+/i, '');

  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }

  try {
    // Role is re-checked against the database on every request so a revoked
    // admin loses access immediately, without waiting for the token to expire.
    const { rows } = await query('SELECT id, email, role FROM users WHERE id = $1', [
      decoded.id
    ]);
    const user = rows[0];

    if (!user || user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied. Admins only.' });
    }

    req.user = user;
    next();
  } catch (error) {
    // A database outage is a 500, not a 401 - the old version reported both
    // identically, which made real incidents look like bad credentials.
    next(error);
  }
};
