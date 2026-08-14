const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { query } = require('../db');

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // users.email is CITEXT, so comparison is case-insensitive in the database.
    const { rows } = await query(
      'SELECT id, email, password, role FROM users WHERE email = $1',
      [String(email).trim()]
    );
    const user = rows[0];

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied. Admins only.' });
    }

    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: '1d'
    });

    res.status(200).json({
      success: true,
      data: {
        token,
        user: { id: user.id, email: user.email, role: user.role }
      }
    });
  } catch (error) {
    next(error);
  }
};
