import { neon } from '@neondatabase/serverless';

function getSql() {
  const conn = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!conn) {
    throw new Error('Neon DATABASE_URL is not connected to this Vercel project.');
  }
  return neon(conn);
}

export async function GET() {
  try {
    const sql = getSql();
    await sql`
      CREATE TABLE IF NOT EXISTS osaka_sync (
        key TEXT PRIMARY KEY,
        val JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    const rows = await sql`SELECT key, val FROM osaka_sync`;
    const state = Object.fromEntries(rows.map(r => [r.key, r.val]));
    return Response.json(state, {
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (err) {
    console.error('Neon GET error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const sql = getSql();
    const { key, val } = await request.json();

    if (!key) {
      return Response.json({ error: 'Missing key' }, { status: 400 });
    }

    await sql`
      CREATE TABLE IF NOT EXISTS osaka_sync (
        key TEXT PRIMARY KEY,
        val JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await sql`
      INSERT INTO osaka_sync (key, val, updated_at)
      VALUES (${key}, ${JSON.stringify(val)}::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE
      SET val = EXCLUDED.val, updated_at = NOW()
    `;

    return Response.json({ ok: true });
  } catch (err) {
    console.error('Neon POST error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
