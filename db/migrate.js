require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { initPool, query, closePool } = require('./index');
const { seed } = require('./seed');
const { seedContent } = require('./seedContent');

// Runs as a one-off Cloud Run Job inside the VPC. tl-db has no public IP, so a
// cloud-sql-proxy tunnel from a developer machine cannot reach it.
const run = async () => {
  await initPool();
  console.log('Connected. Applying schema...');

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await query(schema);
  console.log('Schema applied.');

  if (process.env.SKIP_SEED === 'true') {
    console.log('SKIP_SEED=true - not seeding.');
  } else {
    await seed();
    await seedContent();
  }

  const { rows } = await query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' ORDER BY table_name`
  );
  console.log('Tables:', rows.map((r) => r.table_name).join(', '));
};

run()
  .then(async () => {
    await closePool();
    console.log('Migration complete.');
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('Migration failed:', error);
    await closePool().catch(() => {});
    process.exit(1);
  });
