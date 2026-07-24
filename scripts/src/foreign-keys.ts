import { Client } from "pg";

async function fkEkle() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log("Veritabanına bağlandı.");

  const kisitlar: Array<{ ad: string; sql: string }> = [
    {
      ad: "fk_bba_conversations_user",
      sql: `ALTER TABLE bba_conversations
              ADD CONSTRAINT fk_bba_conversations_user
              FOREIGN KEY (user_id) REFERENCES users(id);`,
    },
    {
      ad: "fk_bba_messages_conversation",
      sql: `ALTER TABLE bba_messages
              ADD CONSTRAINT fk_bba_messages_conversation
              FOREIGN KEY (conversation_id) REFERENCES bba_conversations(id);`,
    },
    {
      ad: "fk_bba_message_sources_message",
      sql: `ALTER TABLE bba_message_sources
              ADD CONSTRAINT fk_bba_message_sources_message
              FOREIGN KEY (message_id) REFERENCES bba_messages(id);`,
    },
    {
      ad: "fk_community_messages_room",
      sql: `ALTER TABLE community_messages
              ADD CONSTRAINT fk_community_messages_room
              FOREIGN KEY (room_id) REFERENCES community_rooms(id);`,
    },
    {
      ad: "fk_community_messages_user",
      sql: `ALTER TABLE community_messages
              ADD CONSTRAINT fk_community_messages_user
              FOREIGN KEY (user_id) REFERENCES users(id);`,
    },
    {
      ad: "fk_community_message_likes_message",
      sql: `ALTER TABLE community_message_likes
              ADD CONSTRAINT fk_community_message_likes_message
              FOREIGN KEY (message_id) REFERENCES community_messages(id);`,
    },
    {
      ad: "fk_community_message_likes_user",
      sql: `ALTER TABLE community_message_likes
              ADD CONSTRAINT fk_community_message_likes_user
              FOREIGN KEY (user_id) REFERENCES users(id);`,
    },
  ];

  for (const k of kisitlar) {
    try {
      await client.query(k.sql);
      console.log(`✓ ${k.ad}`);
    } catch (e: unknown) {
      const mesaj = e instanceof Error ? e.message : String(e);
      if (mesaj.includes("already exists")) {
        console.log(`↩ ${k.ad} zaten mevcut, atlandı.`);
      } else {
        throw e;
      }
    }
  }

  await client.end();
  console.log("\nTüm Foreign Key ilişkileri oluşturuldu.");
}

fkEkle().catch((hata) => {
  console.error("Hata:", hata.message);
  process.exit(1);
});
