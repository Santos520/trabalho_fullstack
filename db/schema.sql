CREATE TABLE IF NOT EXISTS admins (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  platform TEXT NOT NULL,
  release_year INTEGER NOT NULL,
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  payload JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  game_id TEXT NOT NULL REFERENCES games(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  booking_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Solicitado', 'Confirmada', 'Recusado', 'Devolvido', 'Cancelado')),
  reviewed_by TEXT REFERENCES admins(id) ON UPDATE CASCADE ON DELETE SET NULL,
  payload JSONB NOT NULL
);

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reviewed_by TEXT REFERENCES admins(id) ON UPDATE CASCADE ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  game_id TEXT NOT NULL REFERENCES games(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  payload JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS games_featured_title_idx ON games (featured, title);
CREATE INDEX IF NOT EXISTS bookings_status_date_idx ON bookings (status, booking_date DESC);
CREATE INDEX IF NOT EXISTS bookings_client_idx ON bookings (client_id);
CREATE INDEX IF NOT EXISTS reviews_game_idx ON reviews (game_id);
