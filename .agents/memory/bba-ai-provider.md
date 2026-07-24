---
name: BBA AI Provider Decision
description: BBA uygulamasının AI sağlayıcısı ve entegrasyon mimarisi kararları
---

# BBA AI Sağlayıcısı

**Karar:** BBA'nın yapay zekâ sağlayıcısı yalnızca **OpenAI API** olacak.

**Why:** Kullanıcı açıkça belirtti — Anthropic, Replit-managed AI veya başka bir sağlayıcı kullanılmayacak.

**How to apply:**
- AI gerektiren her özellik (gerçek cevap üretimi, belge tarama, hafıza çıkarımı vb.) OpenAI API üzerinden yapılacak.
- Anthropic entegrasyonu (`setupReplitAIIntegrations` vb.) kesinlikle kurulmayacak.
- `AI_INTEGRATIONS_ANTHROPIC_*` env var'larına dokunulmayacak.

# Mevcut Hafıza Sistemi (Faz 1)

- `artifacts/mobile/src/lib/hafiza.ts` — kural tabanlı çıkarım + Supabase yazma
- `memory_type`: nickname, preference, important_fact
- Çalışma zamanı: `finalizeStream` sonunda arka planda, kullanıcı akışını bloklamaz
- AI kullanılmıyor — regex kalıpları ile tetiklenir

# Sonraki Adımlar (Kullanıcı Planı)

Sırasıyla ayrı görevlerde kurulacak:
1. Belge tarama sistemi (OpenAI Embeddings / search)
2. OpenAI API ile gerçek cevap üretimi
3. Kaynaklı cevap sistemi
4. Cevap üretirken hafızayı kullanma (Faz 2)
