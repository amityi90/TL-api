const { query } = require('./index');
const { CONTENT_KEYS } = require('./contentKeys');

// ON CONFLICT DO NOTHING on `name`: re-running the migrate job adds any newly
// declared keys but never resets a value the admin has already edited.
const seedContent = async () => {
  let inserted = 0;

  for (const [index, item] of CONTENT_KEYS.entries()) {
    const { rowCount } = await query(
      `INSERT INTO site_content (name, text, type, section, group_label, label, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (name) DO NOTHING`,
      [
        item.name,
        item.text,
        item.type || 'text',
        item.section,
        item.group_label || null,
        item.label,
        index
      ]
    );
    inserted += rowCount;
  }

  // Metadata is structural, not user data, so keep it in step with the code on
  // every run — only `text` belongs to the admin.
  for (const [index, item] of CONTENT_KEYS.entries()) {
    await query(
      `UPDATE site_content
          SET type = $2, section = $3, group_label = $4, label = $5, sort_order = $6
        WHERE name = $1`,
      [item.name, item.type || 'text', item.section, item.group_label || null, item.label, index]
    );
  }

  const { rows } = await query('SELECT count(*)::int AS count FROM site_content');
  console.log(`Site content: ${inserted} new key(s) inserted, ${rows[0].count} total.`);
};

module.exports = { seedContent };
