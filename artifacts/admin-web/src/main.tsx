import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import "./styles.css";

const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";
const API_REQUEST_TIMEOUT_MS = 15_000;
const API_NETWORK_RETRY_DELAY_MS = 750;

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
type AdminRole = "admin" | "editor" | "support";
type MemberRole = AdminRole | "user";

type Member = {
  id: string;
  email: string | null;
  nickname: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed: boolean;
  access_suspended: boolean;
  role: MemberRole;
  admin_access_active: boolean;
};

type MemberDetail = Member & {
  updated_at: string;
  email_confirmed_at: string | null;
  banned_until: string | null;
  providers: string[];
  conversation_count: number;
  message_count: number;
  active_memory_count: number;
};

type UserMemory = {
  id: string;
  memory_type: "nickname" | "preference" | "important_fact";
  content: string;
  created_at: string;
  updated_at: string;
};

type KnowledgeItem = {
  id: string;
  title: string;
  tags: string[];
  content: string;
  source: string;
  source_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  embedding_status: "ready" | "missing" | "invalid";
};

type EmbeddingSummary = { total: number; ready: number; failed: number };
type AnalyticsReport = {
  periodDays: number;
  generatedAt: string;
  totals: { registeredUsers: number; newUsers: number; activeUsers: number; conversations: number; userMessages: number; bbaMessages: number; sourcedAnswers: number; activeKnowledge: number; failedEmbeddings: number };
  performance: { sampleCount: number; averageResponseMs: number; p95ResponseMs: number; trackedRequests: number; successfulRequests: number; errors: number; timeouts: number; cancelled: number; trackedAverageMs: number; firstResponseAverageMs: number; firstTokenAverageMs: number; embeddingAverageMs: number; searchAverageMs: number; generationAverageMs: number; voiceFirstByteAverageMs: number; conversationLoadAverageMs: number; conversationLoadMaxItems: number; promptTokens: number; completionTokens: number; embeddingTokens: number; estimatedCostUsd: number; errorBreakdown: Record<string, number> };
  daily: { date: string; userMessages: number; bbaMessages: number }[];
};

type AuditLogItem = {
  id: string;
  actor_auth_user_id: string | null;
  actor_role: AdminRole | "unknown";
  actor_email: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  result: "success" | "failure";
  error_code: string | null;
  created_at: string;
};

const memoryTypeLabels: Record<UserMemory["memory_type"], string> = {
  nickname: "Hitap şekli",
  preference: "Tercih",
  important_fact: "Önemli bilgi",
};

const roleLabels: Record<MemberRole, string> = {
  admin: "Yönetici",
  editor: "İçerik Editörü",
  support: "Destek",
  user: "Üye",
};

const auditActionLabels: Record<string, string> = {
  "admin.session.view": "Yönetim oturumunu doğrulama",
  "admin.roles.view": "Rol ve izinleri görüntüleme",
  "analytics.view": "Raporları görüntüleme",
  "content.list": "Kaynakları listeleme",
  "users.list": "Üyeleri listeleme",
  "user.view": "Kullanıcı detayını görüntüleme",
  "audit.list": "Güvenlik kayıtlarını görüntüleme",
  "content.upload": "İçerik dosyası yükleme",
  "content.update": "Kaynak güncelleme",
  "content.activate": "Kaynağı etkinleştirme",
  "content.deactivate": "Kaynağı pasifleştirme",
  "content.delete": "Kaynak silme",
  "user.suspend": "Kullanıcı erişimini askıya alma",
  "user.reactivate": "Kullanıcı erişimini yeniden açma",
  "user.memories.view": "Kullanıcı hafızalarını görüntüleme",
};

const auditTargetLabels: Record<string, string> = {
  content: "Kaynak",
  file: "Dosya",
  user: "Kullanıcı",
  knowledge: "Bilgi tabanı",
  "admin-session": "Yönetim oturumu",
  "admin-roles": "Rol ve izinler",
  analytics: "Raporlar",
  "audit-log": "Güvenlik kayıtları",
};

function formatDate(value: string | null | undefined) {
  if (!value) return "Henüz yok";
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatDuration(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "Ölçüm yok";
  return value < 1000 ? `${Math.round(value)} ms` : `${(value / 1000).toFixed(1)} sn`;
}

function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AdminRole | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mode, setMode] = useState<"login" | "forgot" | "recovery">("login");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordAgain, setNewPasswordAgain] = useState("");

  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedMember, setSelectedMember] = useState<MemberDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [accessUpdating, setAccessUpdating] = useState(false);
  const [memories, setMemories] = useState<UserMemory[] | null>(null);
  const [memoriesLoading, setMemoriesLoading] = useState(false);
  const [contentFile, setContentFile] = useState<File | null>(null);
  const [contentUploading, setContentUploading] = useState(false);
  const [contentResult, setContentResult] = useState("");
  const [contentError, setContentError] = useState("");
  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeItem[]>([]);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [knowledgeError, setKnowledgeError] = useState("");
  const [knowledgeNotice, setKnowledgeNotice] = useState("");
  const [knowledgeQuery, setKnowledgeQuery] = useState("");
  const [knowledgeSearch, setKnowledgeSearch] = useState("");
  const [knowledgeStatus, setKnowledgeStatus] = useState<"active" | "inactive" | "all">("active");
  const [knowledgeEmbeddingStatus, setKnowledgeEmbeddingStatus] = useState<"all" | "ready" | "failed">("all");
  const [embeddingSummary, setEmbeddingSummary] = useState<EmbeddingSummary>({ total: 0, ready: 0, failed: 0 });
  const [knowledgePage, setKnowledgePage] = useState(1);
  const [knowledgeTotal, setKnowledgeTotal] = useState(0);
  const [knowledgeTotalPages, setKnowledgeTotalPages] = useState(1);
  const [selectedKnowledge, setSelectedKnowledge] = useState<KnowledgeItem | null>(null);
  const [knowledgeTitle, setKnowledgeTitle] = useState("");
  const [knowledgeTags, setKnowledgeTags] = useState("");
  const [knowledgeContent, setKnowledgeContent] = useState("");
  const [knowledgeSource, setKnowledgeSource] = useState("");
  const [knowledgeUpdating, setKnowledgeUpdating] = useState(false);
  const [analyticsDays, setAnalyticsDays] = useState<7 | 30 | 90>(30);
  const [analytics, setAnalytics] = useState<AnalyticsReport | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState("");
  const [auditItems, setAuditItems] = useState<AuditLogItem[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState("");
  const [auditQuery, setAuditQuery] = useState("");
  const [auditSearch, setAuditSearch] = useState("");
  const [auditResult, setAuditResult] = useState<"all" | "success" | "failure">("all");
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditTotalPages, setAuditTotalPages] = useState(1);

  const authorizedFetch = useCallback(async (path: string, options: RequestInit = {}, currentSession = session) => {
    if (!currentSession) throw new Error("Oturum bulunamadı.");
    if (!apiBase) throw new Error("Yönetim API adresi yapılandırılmamış.");

    let response: Response | null = null;
    let lastNetworkError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT_MS);
      try {
        response = await fetch(`${apiBase}${path}`, {
          ...options,
          headers: { ...options.headers, Authorization: `Bearer ${currentSession.access_token}` },
          signal: controller.signal,
        });
        break;
      } catch (networkError) {
        lastNetworkError = networkError;
        if (attempt === 0) await wait(API_NETWORK_RETRY_DELAY_MS);
      } finally {
        window.clearTimeout(timeout);
      }
    }

    if (!response) {
      if (lastNetworkError instanceof DOMException && lastNetworkError.name === "AbortError") {
        throw new Error("Sunucu yanıt vermedi. Lütfen tekrar deneyin.");
      }
      throw new Error("Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.");
    }
    if (response.status === 401) {
      await supabase.auth.signOut();
      throw new Error("Oturumunuz sona erdi. Lütfen tekrar giriş yapın.");
    }
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { hata?: string };
      throw new Error(body.hata ?? "İşlem tamamlanamadı.");
    }
    return response;
  }, [session]);

  async function adminSessionCheck(current: Session | null) {
    setRole(null); setPermissions([]);
    if (!current) { setLoading(false); return; }
    try {
      const response = await authorizedFetch("/api/admin/session", {}, current);
      const result = await response.json() as { role?: AdminRole; permissions?: string[] };
      setRole(result.role ?? null); setPermissions(result.permissions ?? []);
    } catch (checkError) {
      setError(checkError instanceof Error ? checkError.message : "Yönetim yetkisi doğrulanamadı.");
      const message = checkError instanceof Error ? checkError.message : "";
      if (message === "Oturumunuz sona erdi. Lütfen tekrar giriş yapın.") {
        setSession(null);
      }
    } finally { setLoading(false); }
  }

  const loadMembers = useCallback(async () => {
    if (!session || !role || !permissions.includes("users.read")) return;
    setMembersLoading(true); setMembersError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (search) params.set("q", search);
      const response = await authorizedFetch(`/api/admin/users?${params}`);
      const result = await response.json() as { users: Member[]; total: number; totalPages: number };
      setMembers(result.users); setTotal(result.total); setTotalPages(result.totalPages);
      if (selectedId && !result.users.some((member) => member.id === selectedId)) {
        setSelectedId(null); setSelectedMember(null);
      }
    } catch (loadError) {
      setMembersError(loadError instanceof Error ? loadError.message : "Üye listesi alınamadı.");
    } finally { setMembersLoading(false); }
  }, [authorizedFetch, page, permissions, role, search, selectedId, session]);

  useEffect(() => { void loadMembers(); }, [loadMembers]);

  const loadKnowledge = useCallback(async () => {
    if (!session || !role || !permissions.includes("content.read")) return;
    setKnowledgeLoading(true); setKnowledgeError("");
    try {
      const params = new URLSearchParams({ page: String(knowledgePage), limit: "10", status: knowledgeStatus, embedding: knowledgeEmbeddingStatus });
      if (knowledgeSearch) params.set("q", knowledgeSearch);
      const response = await authorizedFetch(`/api/admin/content?${params}`);
      const result = await response.json() as { items: KnowledgeItem[]; total: number; totalPages: number; embeddingSummary: EmbeddingSummary };
      setKnowledgeItems(result.items); setKnowledgeTotal(result.total); setKnowledgeTotalPages(result.totalPages);
      setEmbeddingSummary(result.embeddingSummary);
      if (selectedKnowledge && !result.items.some((item) => item.id === selectedKnowledge.id)) setSelectedKnowledge(null);
    } catch (loadError) {
      setKnowledgeError(loadError instanceof Error ? loadError.message : "Kaynak listesi alınamadı.");
    } finally { setKnowledgeLoading(false); }
  }, [authorizedFetch, knowledgeEmbeddingStatus, knowledgePage, knowledgeSearch, knowledgeStatus, permissions, role, selectedKnowledge, session]);

  useEffect(() => { void loadKnowledge(); }, [loadKnowledge]);

  const loadAnalytics = useCallback(async () => {
    if (!session || !role || !permissions.includes("analytics.read")) return;
    setAnalyticsLoading(true); setAnalyticsError("");
    try {
      const response = await authorizedFetch(`/api/admin/analytics?days=${analyticsDays}`);
      setAnalytics(await response.json() as AnalyticsReport);
    } catch (loadError) {
      setAnalyticsError(loadError instanceof Error ? loadError.message : "Raporlar alınamadı.");
    } finally { setAnalyticsLoading(false); }
  }, [analyticsDays, authorizedFetch, permissions, role, session]);

  useEffect(() => { void loadAnalytics(); }, [loadAnalytics]);

  const loadAuditLogs = useCallback(async () => {
    if (!session || !role || !permissions.includes("audit.read")) return;
    setAuditLoading(true); setAuditError("");
    try {
      const params = new URLSearchParams({ page: String(auditPage), limit: "20", result: auditResult });
      if (auditSearch) params.set("q", auditSearch);
      const response = await authorizedFetch(`/api/admin/audit-logs?${params}`);
      const result = await response.json() as { items: AuditLogItem[]; total: number; totalPages: number };
      setAuditItems(result.items); setAuditTotal(result.total); setAuditTotalPages(result.totalPages);
    } catch (loadError) {
      setAuditError(loadError instanceof Error ? loadError.message : "Güvenlik kayıtları alınamadı.");
    } finally { setAuditLoading(false); }
  }, [auditPage, auditResult, auditSearch, authorizedFetch, permissions, role, session]);

  useEffect(() => { void loadAuditLogs(); }, [loadAuditLogs]);

  function selectKnowledge(item: KnowledgeItem) {
    setSelectedKnowledge(item); setKnowledgeTitle(item.title); setKnowledgeTags(item.tags.join(", "));
    setKnowledgeContent(item.content); setKnowledgeSource(item.source); setKnowledgeError(""); setKnowledgeNotice("");
  }

  async function updateKnowledge(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedKnowledge) return;
    setKnowledgeUpdating(true); setKnowledgeError(""); setKnowledgeNotice("");
    try {
      const response = await authorizedFetch(`/api/admin/content/${selectedKnowledge.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: knowledgeTitle, tags: knowledgeTags.split(",").map((tag) => tag.trim()).filter(Boolean), content: knowledgeContent, source: knowledgeSource }),
      });
      const result = await response.json() as { item: KnowledgeItem };
      setSelectedKnowledge({ ...result.item, embedding_status: "ready" }); setKnowledgeNotice("Kaynak güncellendi ve embedding yeniden oluşturuldu.");
      await loadKnowledge();
    } catch (updateError) {
      setKnowledgeError(updateError instanceof Error ? updateError.message : "Kaynak güncellenemedi.");
    } finally { setKnowledgeUpdating(false); }
  }

  async function toggleKnowledge() {
    if (!selectedKnowledge) return;
    const active = !selectedKnowledge.is_active;
    if (!window.confirm(`Bu kaynağı ${active ? "yeniden aktifleştirmek" : "pasifleştirmek"} istediğinize emin misiniz?`)) return;
    setKnowledgeUpdating(true); setKnowledgeError(""); setKnowledgeNotice("");
    try {
      const response = await authorizedFetch(`/api/admin/content/${selectedKnowledge.id}/status`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active }),
      });
      const result = await response.json() as { item: KnowledgeItem };
      setSelectedKnowledge((current) => ({ ...result.item, embedding_status: current?.embedding_status ?? "ready" })); setKnowledgeNotice(active ? "Kaynak aktifleştirildi." : "Kaynak pasifleştirildi ve RAG aramasından çıkarıldı.");
      await loadKnowledge();
    } catch (statusError) {
      setKnowledgeError(statusError instanceof Error ? statusError.message : "Kaynak durumu güncellenemedi.");
    } finally { setKnowledgeUpdating(false); }
  }

  async function deleteKnowledge() {
    if (!selectedKnowledge) return;
    if (!window.confirm(`“${selectedKnowledge.title}” kaynağını silmek istediğinize emin misiniz? Kayıt RAG aramasından çıkarılacaktır.`)) return;
    setKnowledgeUpdating(true); setKnowledgeError(""); setKnowledgeNotice("");
    try {
      await authorizedFetch(`/api/admin/content/${selectedKnowledge.id}`, { method: "DELETE" });
      setSelectedKnowledge(null); setKnowledgeNotice("Kaynak güvenli biçimde silindi ve RAG aramasından çıkarıldı.");
      await loadKnowledge();
    } catch (deleteError) {
      setKnowledgeError(deleteError instanceof Error ? deleteError.message : "Kaynak silinemedi.");
    } finally { setKnowledgeUpdating(false); }
  }

  async function selectMember(id: string) {
    setSelectedId(id); setSelectedMember(null); setMemories(null); setDetailLoading(true); setMembersError("");
    try {
      const response = await authorizedFetch(`/api/admin/users/${id}`);
      const result = await response.json() as { user: MemberDetail };
      setSelectedMember(result.user);
    } catch (detailError) {
      setMembersError(detailError instanceof Error ? detailError.message : "Kullanıcı detayı alınamadı.");
    } finally { setDetailLoading(false); }
  }

  async function loadMemories() {
    if (!selectedMember || !permissions.includes("memories.read")) return;
    setMemoriesLoading(true); setMembersError("");
    try {
      const response = await authorizedFetch(`/api/admin/users/${selectedMember.id}/memories`);
      const result = await response.json() as { memories: UserMemory[] };
      setMemories(result.memories);
    } catch (memoryError) {
      setMembersError(memoryError instanceof Error ? memoryError.message : "Kullanıcı hafızaları görüntülenemedi.");
    } finally { setMemoriesLoading(false); }
  }

  async function uploadContent(event: React.FormEvent) {
    event.preventDefault();
    if (!contentFile) { setContentError("Önce bir PDF, DOCX veya TXT dosyası seçin."); return; }
    setContentUploading(true); setContentError(""); setContentResult("");
    try {
      const form = new FormData();
      form.append("file", contentFile);
      const response = await authorizedFetch("/api/admin/content/upload", { method: "POST", body: form });
      const result = await response.json() as { parsed: number; chunks: number; inserted: number; skipped: number; invalidSections: number };
      setContentResult(`${result.parsed} ana içerikten ${result.chunks} parça oluşturuldu. ${result.inserted} parça eklendi, ${result.skipped} parça zaten bulundu.${result.invalidSections ? ` ${result.invalidSections} geçersiz bölüm atlandı.` : ""}`);
      setContentFile(null);
      const input = document.getElementById("content-file") as HTMLInputElement | null;
      if (input) input.value = "";
      await loadKnowledge();
    } catch (uploadError) {
      setContentError(uploadError instanceof Error ? uploadError.message : "Dosya yüklenemedi.");
    } finally { setContentUploading(false); }
  }

  async function updateMemberAccess(suspended: boolean) {
    if (!selectedMember) return;
    const actionLabel = suspended ? "askıya almak" : "yeniden etkinleştirmek";
    if (!window.confirm(`${selectedMember.email ?? selectedMember.nickname ?? "Bu kullanıcıyı"} ${actionLabel} istediğinize emin misiniz?`)) return;
    const reason = suspended ? window.prompt("Askıya alma nedenini yazın (en az 3 karakter):", "Yönetici kararı") : window.prompt("Yeniden etkinleştirme notu (isteğe bağlı):", "");
    if (reason === null) return;
    if (suspended && reason.trim().length < 3) { setMembersError("Askıya alma nedeni en az 3 karakter olmalıdır."); return; }
    setAccessUpdating(true); setMembersError("");
    try {
      await authorizedFetch(`/api/admin/users/${selectedMember.id}/access`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suspended, reason: reason.trim() }),
      });
      setSelectedMember((current) => current ? { ...current, access_suspended: suspended, banned_until: suspended ? "infinity" : null } : current);
      setMembers((current) => current.map((member) => member.id === selectedMember.id ? { ...member, access_suspended: suspended } : member));
    } catch (accessError) {
      setMembersError(accessError instanceof Error ? accessError.message : "Kullanıcı erişimi güncellenemedi.");
    } finally { setAccessUpdating(false); }
  }

  useEffect(() => {
    const initialize = async () => {
      const params = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const isRecovery = params.get("type") === "recovery" || hashParams.get("type") === "recovery";
      const code = params.get("code");
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        window.history.replaceState({}, document.title, window.location.pathname);
        if (exchangeError) { setError("Şifre yenileme bağlantısı geçersiz veya süresi dolmuş. Yeni bağlantı isteyin."); setMode("forgot"); setLoading(false); return; }
        setMode("recovery");
      } else if (isRecovery) setMode("recovery");
      const { data } = await supabase.auth.getSession(); setSession(data.session);
      if (code || isRecovery) { setLoading(false); return; }
      await adminSessionCheck(data.session);
    };
    void initialize();
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === "PASSWORD_RECOVERY") { setMode("recovery"); setRole(null); setLoading(false); }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function login(event: React.FormEvent) {
    event.preventDefault(); setLoading(true); setError("");
    try {
      const { data, error: loginError } = await supabase.auth.signInWithPassword({ email, password });
      if (loginError || !data.session) { setError("E-posta veya şifre hatalı."); setLoading(false); return; }
      setSession(data.session); await adminSessionCheck(data.session);
    } catch {
      setError("Giriş servisine bağlanılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.");
      setLoading(false);
    }
  }

  async function requestPasswordReset(event: React.FormEvent) {
    event.preventDefault(); setLoading(true); setError(""); setNotice("");
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    if (resetError) setError("Şifre yenileme e-postası gönderilemedi. Lütfen tekrar deneyin.");
    else setNotice("Hesap kayıtlıysa şifre yenileme bağlantısı e-posta adresinize gönderildi.");
    setLoading(false);
  }

  async function updatePassword(event: React.FormEvent) {
    event.preventDefault(); setError(""); setNotice("");
    if (newPassword.length < 8) { setError("Yeni şifre en az 8 karakter olmalıdır."); return; }
    if (newPassword !== newPasswordAgain) { setError("Yeni şifreler birbiriyle eşleşmiyor."); return; }
    setLoading(true);
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) { setError("Şifre yenileme oturumu bulunamadı. Yeni bir bağlantı isteyin."); setLoading(false); return; }
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError) { setError("Şifre yenileme oturumu geçersiz veya süresi dolmuş. Yeni bağlantı isteyin."); setLoading(false); return; }
    await supabase.auth.signOut(); setSession(null); setMode("login"); setPassword(""); setNewPassword(""); setNewPasswordAgain("");
    setNotice("Şifreniz güncellendi. Yeni şifrenizle giriş yapabilirsiniz."); setLoading(false);
  }

  if (loading) return <main className="center"><div className="spinner" aria-label="Yükleniyor" /></main>;

  if (session && role) return (
    <main className="dashboard">
      <header className="topbar">
        <div className="topbarTitle"><div className="brand">BBA</div><div><h1>Üye Yönetimi</h1><span className="roleBadge">{roleLabels[role]}</span></div></div>
        <button className="secondary compact" onClick={() => void supabase.auth.signOut()}>Çıkış yap</button>
      </header>
      <section className="dashboardContent">
        {permissions.includes("analytics.read") && <section className="analyticsPanel">
          <div className="sectionHeading"><div><h2>Kullanım ve Performans</h2><p>Gerçek uygulama ve veritabanı kayıtlarından oluşturulan özet.</p></div><select aria-label="Rapor dönemi" value={analyticsDays} onChange={(event) => setAnalyticsDays(Number(event.target.value) as 7 | 30 | 90)}><option value={7}>Son 7 gün</option><option value={30}>Son 30 gün</option><option value={90}>Son 90 gün</option></select></div>
          {analyticsError && <div className="error" role="alert">{analyticsError}</div>}
          {analyticsLoading && !analytics ? <div className="panelLoading"><div className="spinner" /></div> : analytics && <>
            <div className="analyticsCards">
              <article><span>Kayıtlı üye</span><strong>{analytics.totals.registeredUsers}</strong><small>+{analytics.totals.newUsers} yeni</small></article>
              <article><span>Aktif kullanıcı</span><strong>{analytics.totals.activeUsers}</strong><small>Seçili dönemde</small></article>
              <article><span>Yeni sohbet</span><strong>{analytics.totals.conversations}</strong><small>Seçili dönemde</small></article>
              <article><span>Kullanıcı sorusu</span><strong>{analytics.totals.userMessages}</strong><small>{analytics.totals.bbaMessages} BBA cevabı</small></article>
              <article><span>Kaynaklı cevap</span><strong>{analytics.totals.sourcedAnswers}</strong><small>{analytics.totals.bbaMessages ? `%${Math.round(analytics.totals.sourcedAnswers / analytics.totals.bbaMessages * 100)}` : "%0"} oran</small></article>
              <article><span>Aktif bilgi</span><strong>{analytics.totals.activeKnowledge}</strong><small>{analytics.totals.failedEmbeddings} embedding sorunu</small></article>
            </div>
            <div className="performanceGrid">
              <article><span>Ortalama cevap süresi</span><strong>{formatDuration(analytics.performance.averageResponseMs)}</strong></article>
              <article><span>95. yüzdelik cevap süresi</span><strong>{formatDuration(analytics.performance.p95ResponseMs)}</strong></article>
              <article><span>Ölçülen cevap</span><strong>{analytics.performance.sampleCount}</strong></article>
            </div>
            <p className="metricNote">Cevap süreleri kullanıcı mesajı ile onu izleyen BBA mesajının veritabanı zaman damgaları arasından hesaplanan yaklaşık değerlerdir.</p>
            <div className="telemetryHeading"><h3>Soru, hata ve OpenAI maliyeti</h3><p>Backend tarafından ölçülen gerçek RAG işlemleri.</p></div>
            <div className="telemetryGrid">
              <article><span>Ölçülen soru</span><strong>{analytics.performance.trackedRequests}</strong><small>{analytics.performance.successfulRequests} tamamlandı</small></article>
              <article><span>Backend ortalaması</span><strong>{formatDuration(analytics.performance.trackedAverageMs)}</strong><small>Uçtan uca RAG</small></article>
              <article><span>İlk sunucu yanıtı</span><strong>{formatDuration(analytics.performance.firstResponseAverageMs)}</strong><small>Streaming hazırlık</small></article>
              <article><span>İlk metin parçası</span><strong>{formatDuration(analytics.performance.firstTokenAverageMs)}</strong><small>Gerçek cevap başlangıcı</small></article>
              <article><span>Embedding</span><strong>{formatDuration(analytics.performance.embeddingAverageMs)}</strong><small>Ortalama</small></article>
              <article><span>RAG araması</span><strong>{formatDuration(analytics.performance.searchAverageMs)}</strong><small>Supabase vektör araması</small></article>
              <article><span>Cevap üretimi</span><strong>{formatDuration(analytics.performance.generationAverageMs)}</strong><small>OpenAI</small></article>
              <article><span>Ses başlangıcı</span><strong>{formatDuration(analytics.performance.voiceFirstByteAverageMs)}</strong><small>İlk ses verisi</small></article>
              <article><span>Sohbet yükleme</span><strong>{formatDuration(analytics.performance.conversationLoadAverageMs)}</strong><small>En çok {analytics.performance.conversationLoadMaxItems} mesaj</small></article>
              <article><span>Hata</span><strong>{analytics.performance.errors}</strong><small>Sunucu/OpenAI</small></article>
              <article><span>Timeout</span><strong>{analytics.performance.timeouts}</strong><small>{analytics.performance.cancelled} iptal</small></article>
              <article><span>Tahmini maliyet</span><strong>${Number(analytics.performance.estimatedCostUsd).toFixed(4)}</strong><small>Seçili dönem</small></article>
            </div>
            <div className="tokenSummary">
              <span>Girdi tokenı <strong>{analytics.performance.promptTokens.toLocaleString("tr-TR")}</strong></span>
              <span>Çıktı tokenı <strong>{analytics.performance.completionTokens.toLocaleString("tr-TR")}</strong></span>
              <span>Embedding tokenı <strong>{analytics.performance.embeddingTokens.toLocaleString("tr-TR")}</strong></span>
              {Object.keys(analytics.performance.errorBreakdown ?? {}).length > 0 && <span>Hata türleri <strong>{Object.entries(analytics.performance.errorBreakdown).map(([name, count]) => `${name}: ${count}`).join(" · ")}</strong></span>}
            </div>
            <p className="metricNote">Detaylı ölçümler bu altyapı etkinleştirildikten sonra birikir. Maliyet kaydedilen token kullanımı üzerinden tahmin edilir; soru ve cevap metinleri ölçüm tablosuna kaydedilmez.</p>
            <div className="usageChart" aria-label="Günlük mesaj kullanımı">
              {analytics.daily.map((day) => { const max = Math.max(1, ...analytics.daily.map((item) => Math.max(item.userMessages, item.bbaMessages))); return <div className="usageDay" key={day.date} title={`${day.date}: ${day.userMessages} soru, ${day.bbaMessages} cevap`}><div className="usageBars"><i style={{ height: `${Math.max(3, day.userMessages / max * 100)}%` }} /><i style={{ height: `${Math.max(3, day.bbaMessages / max * 100)}%` }} /></div><span>{new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit" }).format(new Date(day.date))}</span></div>; })}
            </div>
            <div className="chartLegend"><span><i className="userLegend" />Kullanıcı soruları</span><span><i className="bbaLegend" />BBA cevapları</span><small>Güncelleme: {formatDate(analytics.generatedAt)}</small></div>
          </>}
        </section>}
        {permissions.includes("audit.read") && <section className="auditPanel">
          <div className="sectionHeading"><div><h2>Sistem ve Güvenlik Kayıtları</h2><p>Yalnızca yetkili yöneticilerin erişebildiği {auditTotal} denetim kaydı.</p></div></div>
          <form className="auditFilters" onSubmit={(event) => { event.preventDefault(); setAuditPage(1); setAuditSearch(auditQuery.trim()); }}>
            <input aria-label="Güvenlik kayıtlarında ara" placeholder="Yönetici, işlem veya hedef ara" value={auditQuery} onChange={(event) => setAuditQuery(event.target.value)} />
            <select aria-label="İşlem sonucu" value={auditResult} onChange={(event) => { setAuditPage(1); setAuditResult(event.target.value as "all" | "success" | "failure"); }}>
              <option value="all">Tüm sonuçlar</option><option value="success">Başarılı</option><option value="failure">Başarısız</option>
            </select>
            <button type="submit">Ara</button>
            {(auditQuery || auditSearch || auditResult !== "all") && <button className="secondary" type="button" onClick={() => { setAuditQuery(""); setAuditSearch(""); setAuditResult("all"); setAuditPage(1); }}>Temizle</button>}
          </form>
          {auditError && <div className="error" role="alert">{auditError}</div>}
          {auditLoading && auditItems.length === 0 ? <div className="panelLoading"><div className="spinner" /></div> : auditItems.length === 0 ? <div className="emptyState">Bu ölçütlerde güvenlik kaydı bulunamadı.</div> : <div className="auditTableWrap">
            <table className="auditTable">
              <thead><tr><th>Tarih</th><th>Yönetici</th><th>İşlem</th><th>Hedef</th><th>Sonuç</th></tr></thead>
              <tbody>{auditItems.map((item) => <tr key={item.id}>
                <td><time>{formatDate(item.created_at)}</time></td>
                <td><strong>{item.actor_email ?? "Tanımlanamayan hesap"}</strong><small>{item.actor_role === "unknown" ? "Yetkisiz erişim" : roleLabels[item.actor_role]}</small></td>
                <td><strong>{auditActionLabels[item.action] ?? item.action}</strong></td>
                <td><strong>{auditTargetLabels[item.target_type] ?? item.target_type}</strong><small className="auditTargetId">{item.target_id ?? "—"}</small></td>
                <td><span className={`status ${item.result === "success" ? "success" : "dangerStatus"}`}>{item.result === "success" ? "Başarılı" : "Başarısız"}</span>{item.error_code && <small>{item.error_code}</small>}</td>
              </tr>)}</tbody>
            </table>
          </div>}
          <div className="pagination"><button className="secondary compact" disabled={auditPage <= 1 || auditLoading} onClick={() => setAuditPage((value) => value - 1)}>Önceki</button><span>{auditPage} / {auditTotalPages}</span><button className="secondary compact" disabled={auditPage >= auditTotalPages || auditLoading} onClick={() => setAuditPage((value) => value + 1)}>Sonraki</button></div>
        </section>}
        {permissions.includes("content.manage") && <section className="contentUploadPanel">
          <div className="sectionHeading"><div><h2>İçerik Yükleme</h2><p>PDF, DOCX veya TXT dosyasındaki bilgi bölümlerini kaynaklarıyla birlikte ekleyin.</p></div></div>
          <form className="uploadForm" onSubmit={uploadContent}>
            <label className="filePicker" htmlFor="content-file">
              <span>{contentFile ? contentFile.name : "Dosya seçin"}</span>
              <small>{contentFile ? `${(contentFile.size / 1024 / 1024).toFixed(2)} MB` : "En fazla 10 MB · PDF, DOCX veya TXT"}</small>
              <input id="content-file" type="file" accept=".pdf,.docx,.txt" onChange={(event) => { setContentFile(event.target.files?.[0] ?? null); setContentError(""); setContentResult(""); }} />
            </label>
            <button type="submit" disabled={!contentFile || contentUploading}>{contentUploading ? "İşleniyor…" : "İçeriği yükle"}</button>
          </form>
          <div className="formatHelp"><strong>Dosya biçimi</strong><code>Başlık: …<br/>Etiketler: …<br/>İçerik:<br/>…<br/>Kaynak: Youtube Yayını: Kaynak adı https://…<br/>veya<br/>Kaynak: Kitap: Kaynak adı https://…</code></div>
          {contentError && <div className="error" role="alert">{contentError}</div>}
          {contentResult && <div className="notice" role="status">{contentResult}</div>}
        </section>}
        {permissions.includes("content.read") && <section className="knowledgePanel">
          <div className="sectionHeading"><div><h2>Kaynak Yönetimi</h2><p>{knowledgeTotal} aktif veya pasif bilgi kaydı</p></div></div>
          <div className="embeddingSummary" aria-label="Embedding durumu özeti">
            <div><strong>{embeddingSummary.total}</strong><span>Toplam kayıt</span></div>
            <div className="embeddingReady"><strong>{embeddingSummary.ready}</strong><span>Embedding hazır</span></div>
            <div className={embeddingSummary.failed > 0 ? "embeddingFailed" : ""}><strong>{embeddingSummary.failed}</strong><span>Başarısız kayıt</span></div>
          </div>
          <form className="knowledgeFilters" onSubmit={(event) => { event.preventDefault(); setKnowledgePage(1); setKnowledgeSearch(knowledgeQuery.trim()); }}>
            <input aria-label="Kaynak ara" placeholder="Başlık, kaynak, etiket veya içerik ara" value={knowledgeQuery} onChange={(event) => setKnowledgeQuery(event.target.value)} />
            <select aria-label="Kaynak durumu" value={knowledgeStatus} onChange={(event) => { setKnowledgeStatus(event.target.value as "active" | "inactive" | "all"); setKnowledgePage(1); }}>
              <option value="active">Aktif</option><option value="inactive">Pasif</option><option value="all">Tümü</option>
            </select>
            <select aria-label="Embedding durumu" value={knowledgeEmbeddingStatus} onChange={(event) => { setKnowledgeEmbeddingStatus(event.target.value as "all" | "ready" | "failed"); setKnowledgePage(1); }}>
              <option value="all">Tüm embeddingler</option><option value="ready">Embedding hazır</option><option value="failed">Başarısız embeddingler</option>
            </select>
            <button type="submit">Ara</button>
            {knowledgeSearch && <button type="button" className="secondary" onClick={() => { setKnowledgeQuery(""); setKnowledgeSearch(""); setKnowledgePage(1); }}>Temizle</button>}
          </form>
          {knowledgeError && <div className="error" role="alert">{knowledgeError}</div>}
          {knowledgeNotice && <div className="notice" role="status">{knowledgeNotice}</div>}
          <div className="knowledgeLayout">
            <div className="knowledgeList">
              {knowledgeLoading ? <div className="panelLoading"><div className="spinner" /></div> : knowledgeItems.length === 0 ? <div className="emptyState">Bu ölçütlerle eşleşen kaynak bulunamadı.</div> : knowledgeItems.map((item) => (
                <button type="button" key={item.id} className={`knowledgeRow ${selectedKnowledge?.id === item.id ? "selected" : ""}`} onClick={() => selectKnowledge(item)}>
                  <span><strong>{item.title}</strong><small>{item.source}</small></span>
                  <span className="knowledgeBadges"><span className={`status ${item.is_active ? "success" : "warning"}`}>{item.is_active ? "Aktif" : "Pasif"}</span><span className={`status ${item.embedding_status === "ready" ? "success" : "dangerStatus"}`}>{item.embedding_status === "ready" ? "Embedding hazır" : item.embedding_status === "missing" ? "Embedding eksik" : "Embedding geçersiz"}</span></span>
                  <small>{item.content.slice(0, 150)}{item.content.length > 150 ? "…" : ""}</small>
                  <time>{formatDate(item.updated_at)}</time>
                </button>
              ))}
              <div className="pagination"><button type="button" className="secondary compact" disabled={knowledgePage <= 1 || knowledgeLoading} onClick={() => setKnowledgePage((value) => value - 1)}>Önceki</button><span>{knowledgePage} / {knowledgeTotalPages}</span><button type="button" className="secondary compact" disabled={knowledgePage >= knowledgeTotalPages || knowledgeLoading} onClick={() => setKnowledgePage((value) => value + 1)}>Sonraki</button></div>
            </div>
            <aside className="knowledgeEditor">
              {!selectedKnowledge ? <div className="emptyState">Düzenlemek için bir kaynak seçin.</div> : <form onSubmit={updateKnowledge}>
                <div className="editorHeading"><div><strong>Kaynak düzenleme</strong><small>{selectedKnowledge.is_active ? "RAG aramasında aktif" : "RAG aramasında pasif"} · {selectedKnowledge.embedding_status === "ready" ? "Embedding hazır" : selectedKnowledge.embedding_status === "missing" ? "Embedding eksik" : "Embedding geçersiz"}</small></div></div>
                <label>Başlık<input value={knowledgeTitle} maxLength={500} onChange={(event) => setKnowledgeTitle(event.target.value)} required /></label>
                <label>Etiketler<input value={knowledgeTags} onChange={(event) => setKnowledgeTags(event.target.value)} placeholder="virgülle ayırın" /></label>
                <label>İçerik<textarea value={knowledgeContent} maxLength={20000} onChange={(event) => setKnowledgeContent(event.target.value)} required /></label>
                <label>Kaynak adı ve bağlantısı<textarea className="sourceInput" value={knowledgeSource} maxLength={1500} onChange={(event) => setKnowledgeSource(event.target.value)} required /></label>
                {permissions.includes("content.manage") && <div className="editorActions">
                  <button type="submit" disabled={knowledgeUpdating}>{knowledgeUpdating ? "Güncelleniyor…" : "Değişiklikleri kaydet"}</button>
                  <button type="button" className="secondary" disabled={knowledgeUpdating} onClick={() => void toggleKnowledge()}>{selectedKnowledge.is_active ? "Pasifleştir" : "Aktifleştir"}</button>
                  <button type="button" className="dangerButton" disabled={knowledgeUpdating} onClick={() => void deleteKnowledge()}>Sil</button>
                </div>}
              </form>}
            </aside>
          </div>
        </section>}
        <div className="sectionHeading"><div><h2>Üyeler</h2><p>Toplam {total} kayıtlı kullanıcı</p></div></div>
        {!permissions.includes("users.read") ? <div className="emptyState">Bu rolün üye listesini görüntüleme yetkisi yok.</div> : <>
          <form className="searchForm" onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(query.trim()); }}>
            <input aria-label="Üye ara" placeholder="E-posta veya kullanıcı adı ara" value={query} onChange={(event) => setQuery(event.target.value)} />
            <button type="submit">Ara</button>
            {search && <button type="button" className="secondary" onClick={() => { setQuery(""); setSearch(""); setPage(1); }}>Temizle</button>}
          </form>
          {membersError && <div className="error" role="alert">{membersError}</div>}
          <div className="memberLayout">
            <section className="memberListPanel">
              {membersLoading ? <div className="panelLoading"><div className="spinner" /></div> : members.length === 0 ? <div className="emptyState">Aramanızla eşleşen üye bulunamadı.</div> : (
                <div className="tableWrap"><table><thead><tr><th>Üye</th><th>Kayıt tarihi</th><th>Son giriş</th><th>Durum</th></tr></thead><tbody>
                  {members.map((member) => <tr key={member.id} className={selectedId === member.id ? "selected" : ""} onClick={() => void selectMember(member.id)}>
                    <td><strong>{member.nickname || "İsimsiz üye"}</strong><small>{member.email || "E-posta yok"}</small></td>
                    <td>{formatDate(member.created_at)}</td><td>{formatDate(member.last_sign_in_at)}</td>
                    <td>{member.access_suspended ? <span className="status dangerStatus">Askıda</span> : <span className={`status ${member.email_confirmed ? "success" : "warning"}`}>{member.email_confirmed ? "Doğrulandı" : "Bekliyor"}</span>}{member.role !== "user" && <small>{roleLabels[member.role]}</small>}</td>
                  </tr>)}
                </tbody></table></div>
              )}
              <div className="pagination"><button className="secondary compact" disabled={page <= 1 || membersLoading} onClick={() => setPage((value) => value - 1)}>Önceki</button><span>{page} / {totalPages}</span><button className="secondary compact" disabled={page >= totalPages || membersLoading} onClick={() => setPage((value) => value + 1)}>Sonraki</button></div>
            </section>
            <aside className="memberDetail">
              {detailLoading ? <div className="panelLoading"><div className="spinner" /></div> : !selectedMember ? <div className="emptyState">Detaylarını görmek için bir üye seçin.</div> : <>
                <div className="detailHeader"><div className="avatar">{(selectedMember.nickname || selectedMember.email || "Ü").slice(0, 1).toLocaleUpperCase("tr-TR")}</div><div><h2>{selectedMember.nickname || "İsimsiz üye"}</h2><p>{selectedMember.email || "E-posta yok"}</p></div></div>
                <dl><div><dt>Rol</dt><dd>{roleLabels[selectedMember.role]}</dd></div><div><dt>E-posta</dt><dd>{selectedMember.email_confirmed_at ? "Doğrulandı" : "Doğrulanmadı"}</dd></div><div><dt>Üyelik tarihi</dt><dd>{formatDate(selectedMember.created_at)}</dd></div><div><dt>Son giriş</dt><dd>{formatDate(selectedMember.last_sign_in_at)}</dd></div><div><dt>Giriş yöntemleri</dt><dd>{selectedMember.providers.length ? selectedMember.providers.join(", ") : "E-posta"}</dd></div></dl>
                <div className="stats"><div><strong>{selectedMember.conversation_count}</strong><span>Sohbet</span></div><div><strong>{selectedMember.message_count}</strong><span>Mesaj</span></div><div><strong>{selectedMember.active_memory_count}</strong><span>Aktif hafıza</span></div></div>
                {permissions.includes("users.manage") && selectedMember.role === "user" && <div className="accessActions">
                  <div><strong>{selectedMember.access_suspended ? "Erişim askıya alındı" : "Erişim aktif"}</strong><p>{selectedMember.access_suspended ? "Kullanıcı giriş yapamaz ve API'ye erişemez." : "Kullanıcı uygulamayı normal şekilde kullanabilir."}</p></div>
                  <button className={selectedMember.access_suspended ? "successButton" : "dangerButton"} disabled={accessUpdating} onClick={() => void updateMemberAccess(!selectedMember.access_suspended)}>{accessUpdating ? "Güncelleniyor…" : selectedMember.access_suspended ? "Erişimi yeniden aç" : "Erişimi askıya al"}</button>
                </div>}
                {permissions.includes("memories.read") && <div className="memoryAccess">
                  <div><strong>Kullanıcı hafızaları</strong><p>Bu alan kişisel bilgi içerir. Görüntüleme işlemi denetim kaydına yazılır.</p></div>
                  {memories === null ? <button className="secondary" disabled={memoriesLoading} onClick={() => void loadMemories()}>{memoriesLoading ? "Yükleniyor…" : "Hafızaları görüntüle"}</button> : <>
                    {memories.length === 0 ? <div className="memoryEmpty">Aktif hafıza kaydı bulunmuyor.</div> : <div className="memoryList">{memories.map((memory) => <article key={memory.id}><span>{memoryTypeLabels[memory.memory_type]}</span><p>{memory.content}</p><small>Güncelleme: {formatDate(memory.updated_at)}</small></article>)}</div>}
                    <button className="linkButton" onClick={() => setMemories(null)}>Hafızaları gizle</button>
                  </>}
                </div>}
              </>}
            </aside>
          </div>
        </>}
      </section>
    </main>
  );

  if (mode === "recovery") return <main className="center"><section className="card"><div className="brand">BBA</div><h1>Yeni Şifre</h1><p>Yönetim hesabınız için yeni bir şifre belirleyin.</p><form onSubmit={updatePassword}><label>Yeni Şifre<input type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8}/></label><label>Yeni Şifre tekrar<input type="password" autoComplete="new-password" value={newPasswordAgain} onChange={(e) => setNewPasswordAgain(e.target.value)} required minLength={8}/></label>{error && <div className="error">{error}</div>}<button disabled={loading}>Şifreyi güncelle</button></form></section></main>;
  if (mode === "forgot") return <main className="center"><section className="card"><div className="brand">BBA</div><h1>Şifremi Unuttum</h1><p>Şifre yenileme bağlantısını e-posta adresinize gönderelim.</p><form onSubmit={requestPasswordReset}><label>E-posta<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>{error && <div className="error">{error}</div>}{notice && <div className="notice">{notice}</div>}<button disabled={loading}>{loading ? "Gönderiliyor…" : "Yenileme bağlantısı gönder"}</button><button className="secondary" type="button" onClick={() => { setMode("login"); setError(""); setNotice(""); }}>Giriş ekranına dön</button></form></section></main>;
  return <main className="center"><section className="card"><div className="brand">BBA</div><h1>Yönetim Girişi</h1><p>Yalnızca yetkili hesaplar erişebilir.</p><form onSubmit={login}><label>E-posta<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label><label>Şifre<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6}/></label>{error && <div className="error">{error}</div>}{notice && <div className="notice">{notice}</div>}<button disabled={loading}>{loading ? "Doğrulanıyor…" : "Giriş yap"}</button><button className="linkButton" type="button" onClick={() => { setMode("forgot"); setError(""); setNotice(""); }}>Şifremi unuttum</button></form></section></main>;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
