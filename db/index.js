const { Pool, types } = require('pg');

// pg returns NUMERIC as a string to preserve precision. The API has always
// emitted prices as JSON numbers (Mongo stored them as doubles) and the UIs
// call price.toFixed(2) on them, so parse NUMERIC back to a number on the way
// out. Storage and arithmetic stay exact NUMERIC inside Postgres.
types.setTypeParser(1700, (value) => (value === null ? null : parseFloat(value)));

// Two connection modes:
//   DB_HOST set  -> plain TCP, for local development against a local Postgres.
//   otherwise    -> Cloud SQL connector, for Cloud Run. tl-db has no public IP,
//                   so this is the only way in and it cannot be reached from a laptop.
let pool;
let connector;

const initPool = async () => {
  if (pool) return pool;

  const common = {
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    max: Number(process.env.DB_POOL_MAX || 5),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  };

  if (process.env.DB_HOST) {
    pool = new Pool({
      ...common,
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 5432)
    });
  } else {
    const instanceConnectionName = process.env.DB_INSTANCE_CONN;
    if (!instanceConnectionName) {
      throw new Error('Set DB_INSTANCE_CONN (Cloud SQL) or DB_HOST (local Postgres)');
    }
    const { Connector } = require('@google-cloud/cloud-sql-connector');
    connector = new Connector();
    const clientOpts = await connector.getOptions({
      instanceConnectionName,
      ipType: process.env.DB_IP_TYPE || 'PRIVATE'
    });
    pool = new Pool({ ...common, ...clientOpts });
  }

  // Fail fast. The old mongoose.connect() was never awaited, so the process
  // started happily and then served 500s when the database was unreachable.
  const client = await pool.connect();
  client.release();
  return pool;
};

const getPool = () => {
  if (!pool) throw new Error('Database pool not initialised - call initPool() first');
  return pool;
};

const query = (text, params) => getPool().query(text, params);

const withTransaction = async (fn) => {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const closePool = async () => {
  if (pool) await pool.end();
  if (connector) connector.close();
  pool = undefined;
  connector = undefined;
};

module.exports = { initPool, getPool, query, withTransaction, closePool };
