-- TL Shop schema (PostgreSQL)
-- Idempotent: safe to re-run. Applied by db/migrate.js.

CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS products (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL,
  price        NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  images       TEXT[] NOT NULL DEFAULT '{}',
  category     TEXT NOT NULL CHECK (category IN
                 ('Rings','Necklaces','Earrings','Bracelets','Watches','Other')),
  material     TEXT NOT NULL,
  stock_count  INTEGER NOT NULL DEFAULT 10 CHECK (stock_count >= 0),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- citext so a capitalised address still matches at login. The old Mongo schema
-- lacked lowercase:true while the controller lowercased input, so such a user
-- could never sign in.
CREATE TABLE IF NOT EXISTS users (
  id         SERIAL PRIMARY KEY,
  email      CITEXT UNIQUE NOT NULL,
  password   TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id                SERIAL PRIMARY KEY,
  full_name         TEXT NOT NULL,
  address           TEXT NOT NULL,
  city              TEXT NOT NULL,
  postal_code       TEXT NOT NULL,
  phone             TEXT NOT NULL,
  email             TEXT,
  carrier           TEXT,
  tracking_number   TEXT,
  arrival_at        TIMESTAMPTZ,
  payment_method    TEXT NOT NULL CHECK (payment_method IN ('Card','PayPal')),
  payment_status    TEXT NOT NULL DEFAULT 'Pending' CHECK (payment_status IN ('Pending','Paid')),
  payment_intent_id TEXT,
  total_amount      NUMERIC(10,2) NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','shipped','arrived','archived')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- unit_price snapshots what the customer actually paid. Without it, historical
-- orders silently re-price whenever a product's price changes.
CREATE TABLE IF NOT EXISTS order_items (
  id         SERIAL PRIMARY KEY,
  order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  quantity   INTEGER NOT NULL CHECK (quantity >= 1),
  unit_price NUMERIC(10,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  subject    TEXT NOT NULL,
  message    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Editable storefront copy and section imagery. `name` is the lookup key the
-- frontend uses; `text` is the value (an image URL for type = 'image'). The
-- remaining columns are presentation metadata for the admin UI's grouping, and
-- are never writable through the API.
CREATE TABLE IF NOT EXISTS site_content (
  id          SERIAL PRIMARY KEY,
  name        TEXT UNIQUE NOT NULL,
  text        TEXT NOT NULL DEFAULT '',
  type        TEXT NOT NULL DEFAULT 'text'
                CHECK (type IN ('text','textarea','image')),
  section     TEXT NOT NULL,
  group_label TEXT,
  label       TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON order_items (order_id);
CREATE INDEX IF NOT EXISTS site_content_section_idx ON site_content (section, sort_order);
CREATE INDEX IF NOT EXISTS orders_status_created_at_idx ON orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS products_category_idx ON products (category);
