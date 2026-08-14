const bcrypt = require('bcryptjs');
const { query } = require('./index');

const seedProducts = [
  {
    name: '18k Gold Essence Ring',
    description: 'A timeless band crafted from solid 18k yellow gold, featuring a subtle matte finish that glows with warmth.',
    price: 850,
    images: ['https://images.unsplash.com/photo-1605100804763-ebea23b88d8b?auto=format&fit=crop&q=80&w=800'],
    category: 'Rings',
    material: '18k Gold',
    stockCount: 15
  },
  {
    name: 'Midnight Sapphire Pendant',
    description: 'A deep blue sapphire suspended from a delicate platinum chain, surrounded by a halo of brilliant-cut diamonds.',
    price: 1250,
    images: ['https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&q=80&w=800'],
    category: 'Necklaces',
    material: 'Platinum',
    stockCount: 8
  },
  {
    name: 'Diamond Pavé Bracelet',
    description: 'An exquisite bangle encrusted with pavé-set diamonds, offering a continuous shimmer around the wrist.',
    price: 2100,
    images: ['https://images.unsplash.com/photo-1573408301185-9146fe634ad0?auto=format&fit=crop&q=80&w=800'],
    category: 'Bracelets',
    material: '18k White Gold',
    stockCount: 5
  },
  {
    name: 'Rose Gold Drop Earrings',
    description: 'Elegant drop earrings featuring soft rose gold teardrops that sway gently with every movement.',
    price: 650,
    images: ['https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&q=80&w=800'],
    category: 'Earrings',
    material: '14k Rose Gold',
    stockCount: 12
  },
  {
    name: 'Emerald Solitaire Necklace',
    description: 'A striking emerald cut stone set in a minimal gold bezel, perfect for adding a pop of color to any outfit.',
    price: 980,
    images: ['https://images.unsplash.com/photo-1599643478518-17488fbbcd75?auto=format&fit=crop&q=80&w=800'],
    category: 'Necklaces',
    material: '18k Gold',
    stockCount: 10
  }
];

// Idempotent. The old seed.js opened with Product.deleteMany({}), which wiped
// the live catalogue every time it ran; this only fills an empty table.
const seed = async () => {
  const { rows } = await query('SELECT count(*)::int AS count FROM products');
  if (rows[0].count === 0) {
    for (const p of seedProducts) {
      await query(
        `INSERT INTO products (name, description, price, images, category, material, stock_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [p.name, p.description, p.price, p.images, p.category, p.material, p.stockCount]
      );
    }
    console.log(`Seeded ${seedProducts.length} products.`);
  } else {
    console.log(`Products table already has ${rows[0].count} rows - skipping product seed.`);
  }

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@tehilalevi.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const hashed = await bcrypt.hash(adminPassword, await bcrypt.genSalt(10));

  await query(
    `INSERT INTO users (email, password, role)
     VALUES ($1, $2, 'admin')
     ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password, role = 'admin'`,
    [adminEmail, hashed]
  );
  console.log(`Admin user ready: ${adminEmail}`);
  if (!process.env.ADMIN_PASSWORD) {
    console.warn('WARNING: admin password defaulted to "admin123". Set ADMIN_PASSWORD before launch.');
  }
};

module.exports = { seed, seedProducts };
