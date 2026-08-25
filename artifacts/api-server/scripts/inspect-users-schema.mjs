import pg from "pg";

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) throw new Error("SUPABASE_DB_URL tanımlı değil.");

const client = new pg.Client({ connectionString });
await client.connect();

try {
  const result = await client.query(
    `select table_schema, table_name, column_name, data_type, is_nullable
       from information_schema.columns
      where (table_schema = 'public' and table_name in
             ('users', 'bba_conversations', 'bba_messages', 'bba_user_memories'))
         or (table_schema = 'auth' and table_name = 'users' and column_name in
             ('id', 'email', 'created_at', 'updated_at', 'last_sign_in_at', 'email_confirmed_at'))
      order by table_schema, ordinal_position`,
  );
  console.log(JSON.stringify(result.rows));
} finally {
  await client.end();
}
