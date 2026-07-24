import { Client } from "pg";

async function kontrol() {
  const client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await client.connect();

  const semalar = await client.query(
    `SELECT schema_name FROM information_schema.schemata ORDER BY schema_name`
  );
  console.log("Şemalar:", semalar.rows.map((x: { schema_name: string }) => x.schema_name).join(", "));

  const tablolar = await client.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
  );
  console.log("public tablolar:", tablolar.rows.map((x: { table_name: string }) => x.table_name).join(", "));

  await client.end();
}

kontrol().catch((e) => { console.error(e.message); process.exit(1); });
