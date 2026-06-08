/**
 * Contactos (consentimiento previo a compartir). Idempotente.
 *   npx tsx --env-file=.env.prod scripts/migrate-contacts.ts
 *
 * A pide a B; B acepta una vez. Solo entre contactos aceptados se permite
 * crear shares. Al aceptar se fijan (TOFU) las exchange pubkeys de ambos.
 */
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) { console.error('✗ falta DATABASE_URL'); process.exit(1); }

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(`
    DO $$ BEGIN
      CREATE TYPE contact_status AS ENUM ('pending', 'accepted', 'declined', 'blocked');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS contacts (
      id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      requester_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      addressee_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status          contact_status NOT NULL DEFAULT 'pending',
      requester_exchange_pk BYTEA,
      addressee_exchange_pk  BYTEA,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      responded_at    TIMESTAMPTZ,
      CONSTRAINT contacts_no_self CHECK (requester_id <> addressee_id),
      UNIQUE (requester_id, addressee_id)
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS contacts_addressee_idx ON contacts(addressee_id) WHERE status = 'pending'`);
  await client.query(`CREATE INDEX IF NOT EXISTS contacts_pair_idx ON contacts(requester_id, addressee_id)`);
  console.log('✅ contacts: tabla + enum + índices listos');
} finally {
  await client.end();
}
