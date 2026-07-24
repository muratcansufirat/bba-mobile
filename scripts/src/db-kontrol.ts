import { Client } from "pg";

async function kontrol() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const r = await client.query(
    `SELECT schema_name FROM information_schema.schemata ORDER BY schema_name`
  );
  console.log("Mevcut şemalar:", r.rows.map((x: { schema_name: string }) => x.schema_name).join(", "));

  await client.end();
}

kontrol().catch((e) => { console.error(e.message); process.exit(1); });
