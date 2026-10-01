const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

function createDatabase(connectionString) {
  const local = /(?:localhost|127\.0\.0\.1)/i.test(connectionString);
  const sslEnabled = process.env.DATABASE_SSL === 'true' || (process.env.DATABASE_SSL !== 'false' && !local);
  const pool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ...(sslEnabled ? { ssl: { rejectUnauthorized: false } } : { ssl: false })
  });

  let writeQueue = Promise.resolve();

  async function initialize() {
    const schema = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
    await pool.query(schema);
  }

  async function loadState() {
    const [admins, clients, games, bookings, reviews] = await Promise.all([
      pool.query('SELECT payload FROM admins ORDER BY id'),
      pool.query('SELECT payload FROM clients ORDER BY id'),
      pool.query('SELECT payload FROM games ORDER BY title'),
      pool.query('SELECT payload FROM bookings ORDER BY booking_date, id'),
      pool.query('SELECT payload FROM reviews ORDER BY id')
    ]);
    return {
      admins: admins.rows.map(row => row.payload),
      clients: clients.rows.map(row => row.payload),
      games: games.rows.map(row => row.payload),
      bookings: bookings.rows.map(row => row.payload),
      reviews: reviews.rows.map(row => row.payload)
    };
  }

  async function writeSnapshot(state) {
    const connection = await pool.connect();
    try {
      await connection.query('BEGIN');
      await upsertRows(connection, 'admins', state.admins, (row, payload) => connection.query(
        'INSERT INTO admins (id, email, payload) VALUES ($1, $2, $3::jsonb) ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, payload = EXCLUDED.payload',
        [row.id, row.email, payload]
      ));
      await upsertRows(connection, 'clients', state.clients, (row, payload) => connection.query(
        'INSERT INTO clients (id, email, payload) VALUES ($1, $2, $3::jsonb) ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, payload = EXCLUDED.payload',
        [row.id, row.email, payload]
      ));
      await upsertRows(connection, 'games', state.games, (row, payload) => connection.query(
        'INSERT INTO games (id, title, category, platform, release_year, featured, payload) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb) ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, category = EXCLUDED.category, platform = EXCLUDED.platform, release_year = EXCLUDED.release_year, featured = EXCLUDED.featured, payload = EXCLUDED.payload',
        [row.id, row.title, row.category, row.platform, row.year, Boolean(row.featured), payload]
      ));
      await upsertRows(connection, 'bookings', state.bookings, (row, payload) => connection.query(
        'INSERT INTO bookings (id, client_id, game_id, booking_date, status, reviewed_by, payload) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb) ON CONFLICT (id) DO UPDATE SET client_id = EXCLUDED.client_id, game_id = EXCLUDED.game_id, booking_date = EXCLUDED.booking_date, status = EXCLUDED.status, reviewed_by = EXCLUDED.reviewed_by, payload = EXCLUDED.payload',
        [row.id, row.clientId, row.gameId, row.date, row.status, row.reviewedBy || null, payload]
      ));
      await upsertRows(connection, 'reviews', state.reviews, (row, payload) => connection.query(
        'INSERT INTO reviews (id, client_id, game_id, rating, payload) VALUES ($1, $2, $3, $4, $5::jsonb) ON CONFLICT (id) DO UPDATE SET client_id = EXCLUDED.client_id, game_id = EXCLUDED.game_id, rating = EXCLUDED.rating, payload = EXCLUDED.payload',
        [row.id, row.clientId, row.gameId, row.rating, payload]
      ));

      await pruneRows(connection, 'reviews', state.reviews);
      await pruneRows(connection, 'bookings', state.bookings);
      await pruneRows(connection, 'games', state.games);
      await pruneRows(connection, 'clients', state.clients);
      await pruneRows(connection, 'admins', state.admins);
      await connection.query('COMMIT');
    } catch (error) {
      await connection.query('ROLLBACK');
      throw error;
    } finally {
      connection.release();
    }
  }

  function saveState(state) {
    const snapshot = JSON.parse(JSON.stringify(state));
    const operation = writeQueue.then(() => writeSnapshot(snapshot));
    writeQueue = operation.catch(() => {});
    return operation;
  }

  async function upsertRows(connection, table, rows, insertRow) {
    for (const row of rows) await insertRow(row, JSON.stringify(row));
  }

  async function pruneRows(connection, table, rows) {
    if (!rows.length) {
      await connection.query(`DELETE FROM ${table}`);
      return;
    }
    await connection.query(`DELETE FROM ${table} WHERE NOT (id = ANY($1::text[]))`, [rows.map(row => row.id)]);
  }

  async function close() {
    await pool.end();
  }

  return { initialize, loadState, saveState, close };
}

module.exports = { createDatabase };
