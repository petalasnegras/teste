(() => {
  "use strict";

  // ---------- util ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const val = (id) => $(id).value.trim();
  const orNull = (v) => (v === "" || v == null ? null : v);
  const numOrNull = (v) => (v === "" || v == null ? null : Number(v));

  const BUCKET = "club-media";
  const MAX_IMG = 2 * 1024 * 1024;

  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 2800);
  }

  // ---------- Supabase ----------
  const cfg = window.APP_CONFIG || {};
  const configured = cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes("SEU-PROJETO") && cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_ANON_KEY.includes("SUA-CHAVE");

  if (!configured) {
    showView("login");
    const err = $("#login-error");
    err.textContent = "Configure SUPABASE_URL e SUPABASE_ANON_KEY no arquivo config.js.";
    err.hidden = false;
    $("#login-btn").disabled = true;
    return;
  }

  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  // ---------- views ----------
  function showView(name) {
    $("#view-login").hidden = name !== "login";
    $("#view-app").hidden = name !== "app";
  }

  function showTab(name) {
    $$(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
    ["club", "squad", "matches", "trainings"].forEach((n) => {
      $("#tab-" + n).hidden = n !== name;
    });
  }
  $$(".tab").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));

  // ---------- auth ----------
  let booting = false;

  async function isAdmin(userId) {
    const { data, error } = await sb.from("admins").select("user_id").eq("user_id", userId).maybeSingle();
    return !error && !!data;
  }

  async function enterApp(session) {
    if (booting) return;
    booting = true;
    try {
      if (!(await isAdmin(session.user.id))) {
        await sb.auth.signOut();
        showView("login");
        showLoginError("Esta conta não tem permissão de administrador.");
        return;
      }
      $("#user-email").textContent = session.user.email;
      showView("app");
      await Promise.all([loadClub(), loadPlayers(), loadMatches(), loadTrainings()]);
    } finally {
      booting = false;
    }
  }

  function showLoginError(msg) {
    const e = $("#login-error");
    e.textContent = msg;
    e.hidden = !msg;
  }

  $("#login-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    showLoginError("");
    const btn = $("#login-btn");
    btn.disabled = true;
    btn.textContent = "Entrando…";
    const { data, error } = await sb.auth.signInWithPassword({
      email: val("#login-email"),
      password: $("#login-password").value,
    });
    btn.disabled = false;
    btn.textContent = "Entrar";
    if (error) {
      showLoginError("E-mail ou senha incorretos.");
      return;
    }
    $("#login-password").value = "";
    await enterApp(data.session);
  });

  $("#logout-btn").addEventListener("click", async () => {
    await sb.auth.signOut();
    showView("login");
  });

  sb.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") showView("login");
  });

  // ---------- upload ----------
  async function uploadImage(file, folder) {
    if (!file.type.startsWith("image/")) throw new Error("Selecione um arquivo de imagem.");
    if (file.size > MAX_IMG) throw new Error("A imagem deve ter no máximo 2 MB.");
    const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }

  function setPreview(el, url, fallback) {
    el.innerHTML = url ? `<img src="${esc(url)}" alt="">` : fallback;
  }

  // =====================================================================
  // CLUBE
  // =====================================================================
  let clubLogoUrl = null;
  let clubLogoFile = null;

  async function loadClub() {
    const { data, error } = await sb.from("club_profile").select("*").eq("id", 1).maybeSingle();
    if (error) return toast("Erro ao carregar o clube: " + error.message);
    const c = data || {};
    $("#club-name").value = c.name || "";
    $("#club-nickname").value = c.nickname || "";
    $("#club-founded").value = c.founded_year ?? "";
    $("#club-city").value = c.city || "";
    $("#club-venue").value = c.home_venue || "";
    $("#club-color1").value = c.primary_color || "#16a34a";
    $("#club-color2").value = c.secondary_color || "#ffffff";
    $("#club-email").value = c.email || "";
    $("#club-phone").value = c.phone || "";
    $("#club-instagram").value = c.instagram || "";
    $("#club-description").value = c.description || "";
    clubLogoUrl = c.logo_url || null;
    clubLogoFile = null;
    setPreview($("#club-logo-preview"), clubLogoUrl, "🛡️");
    applyBranding(c);
  }

  function applyBranding(c) {
    $("#topbar-name").textContent = c.name || "Meu Clube";
    document.title = (c.name ? c.name + " · " : "") + "Gestão de Futsal";
    const logo = $("#topbar-logo");
    logo.hidden = !c.logo_url;
    if (c.logo_url) logo.src = c.logo_url;
    if (c.primary_color) {
      document.documentElement.style.setProperty("--accent", c.primary_color);
      document.documentElement.style.setProperty("--accent-dark", c.primary_color);
    }
  }

  $("#club-logo-file").addEventListener("change", (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    if (!f.type.startsWith("image/") || f.size > MAX_IMG) {
      ev.target.value = "";
      return toast("Escolha uma imagem de até 2 MB.");
    }
    clubLogoFile = f;
    setPreview($("#club-logo-preview"), URL.createObjectURL(f), "🛡️");
  });

  $("#club-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const btn = $("#club-save");
    const status = $("#club-status");
    btn.disabled = true;
    status.textContent = "Salvando…";
    try {
      if (clubLogoFile) {
        clubLogoUrl = await uploadImage(clubLogoFile, "club");
        clubLogoFile = null;
      }
      const row = {
        id: 1,
        name: val("#club-name"),
        nickname: orNull(val("#club-nickname")),
        founded_year: numOrNull(val("#club-founded")),
        city: orNull(val("#club-city")),
        home_venue: orNull(val("#club-venue")),
        primary_color: $("#club-color1").value,
        secondary_color: $("#club-color2").value,
        email: orNull(val("#club-email")),
        phone: orNull(val("#club-phone")),
        instagram: orNull(val("#club-instagram")),
        description: orNull(val("#club-description")),
        logo_url: clubLogoUrl,
      };
      const { error } = await sb.from("club_profile").upsert(row);
      if (error) throw error;
      applyBranding(row);
      status.textContent = "";
      toast("Perfil do clube salvo.");
    } catch (e) {
      status.textContent = "";
      toast("Erro ao salvar: " + (e.message || e));
    } finally {
      btn.disabled = false;
    }
  });

  // =====================================================================
  // ELENCO
  // =====================================================================
  let players = [];
  let editingId = null;
  let playerPhotoUrl = null;
  let playerPhotoFile = null;

  async function loadPlayers() {
    const { data, error } = await sb
      .from("players")
      .select("*")
      .order("shirt_number", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true });
    if (error) return toast("Erro ao carregar o elenco: " + error.message);
    players = data || [];
    renderPlayers();
  }

  function age(birth) {
    if (!birth) return null;
    const b = new Date(birth + "T00:00:00");
    const n = new Date();
    let a = n.getFullYear() - b.getFullYear();
    if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--;
    return a;
  }

  function initials(name) {
    const p = name.trim().split(/\s+/);
    return ((p[0]?.[0] || "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
  }

  function renderPlayers() {
    const q = val("#squad-search").toLowerCase();
    const pos = $("#squad-filter-position").value;
    const st = $("#squad-filter-status").value;

    const list = players.filter((p) => {
      if (pos && p.position !== pos) return false;
      if (st && p.status !== st) return false;
      if (!q) return true;
      return [p.name, p.nickname, p.shirt_number].some((v) => String(v ?? "").toLowerCase().includes(q));
    });

    const active = players.filter((p) => p.status === "Ativo").length;
    $("#squad-count").textContent = `${players.length} jogador(es) · ${active} ativo(s)`;
    $("#squad-empty").hidden = list.length > 0;

    $("#squad-grid").innerHTML = list
      .map((p) => {
        const a = age(p.birth_date);
        const meta = [p.position, a != null ? a + " anos" : null].filter(Boolean).join(" · ");
        return `
        <button type="button" class="player" data-id="${esc(p.id)}">
          ${p.shirt_number != null ? `<span class="number">${esc(p.shirt_number)}</span>` : ""}
          <span class="avatar">${p.photo_url ? `<img src="${esc(p.photo_url)}" alt="">` : esc(initials(p.name))}</span>
          <span class="player-info">
            <div class="player-name">${esc(p.nickname || p.name)}</div>
            <div class="player-meta">${esc(p.nickname ? p.name : meta)}</div>
            ${p.nickname ? `<div class="player-meta">${esc(meta)}</div>` : ""}
            <span class="badge ${esc(p.status)}">${esc(p.status)}</span>
          </span>
        </button>`;
      })
      .join("");
  }

  ["#squad-search", "#squad-filter-position", "#squad-filter-status"].forEach((s) =>
    $(s).addEventListener("input", renderPlayers)
  );

  $("#squad-grid").addEventListener("click", (ev) => {
    const card = ev.target.closest(".player");
    if (card) openPlayer(card.dataset.id);
  });

  // ---- modal ----
  const dlg = $("#player-dialog");

  function openPlayer(id) {
    const p = id ? players.find((x) => x.id === id) : null;
    editingId = p ? p.id : null;
    playerPhotoFile = null;
    playerPhotoUrl = p?.photo_url || null;

    $("#player-dialog-title").textContent = p ? "Editar jogador" : "Novo jogador";
    $("#p-name").value = p?.name || "";
    $("#p-nickname").value = p?.nickname || "";
    $("#p-number").value = p?.shirt_number ?? "";
    $("#p-position").value = p?.position || "Ala";
    $("#p-status").value = p?.status || "Ativo";
    $("#p-birth").value = p?.birth_date || "";
    $("#p-foot").value = p?.dominant_foot || "";
    $("#p-height").value = p?.height_cm ?? "";
    $("#p-weight").value = p?.weight_kg ?? "";
    $("#p-phone").value = p?.phone || "";
    $("#p-email").value = p?.email || "";
    $("#p-notes").value = p?.notes || "";
    $("#player-photo-file").value = "";
    setPreview($("#player-photo-preview"), playerPhotoUrl, "👤");
    $("#player-delete").hidden = !p;
    $("#player-error").hidden = true;
    dlg.showModal();
  }

  function closePlayer() {
    dlg.close();
  }

  $("#player-add").addEventListener("click", () => openPlayer(null));
  $("#player-close").addEventListener("click", closePlayer);
  $("#player-cancel").addEventListener("click", closePlayer);
  dlg.addEventListener("click", (ev) => {
    if (ev.target === dlg) closePlayer(); // clique no fundo
  });

  $("#player-photo-file").addEventListener("change", (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    if (!f.type.startsWith("image/") || f.size > MAX_IMG) {
      ev.target.value = "";
      return toast("Escolha uma imagem de até 2 MB.");
    }
    playerPhotoFile = f;
    setPreview($("#player-photo-preview"), URL.createObjectURL(f), "👤");
  });

  $("#player-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const btn = $("#player-save");
    const err = $("#player-error");
    err.hidden = true;
    btn.disabled = true;
    btn.textContent = "Salvando…";
    try {
      if (playerPhotoFile) {
        playerPhotoUrl = await uploadImage(playerPhotoFile, "players");
      }
      const row = {
        name: val("#p-name"),
        nickname: orNull(val("#p-nickname")),
        shirt_number: numOrNull(val("#p-number")),
        position: $("#p-position").value,
        status: $("#p-status").value,
        birth_date: orNull($("#p-birth").value),
        dominant_foot: orNull($("#p-foot").value),
        height_cm: numOrNull(val("#p-height")),
        weight_kg: numOrNull(val("#p-weight")),
        phone: orNull(val("#p-phone")),
        email: orNull(val("#p-email")),
        notes: orNull(val("#p-notes")),
        photo_url: playerPhotoUrl,
      };
      const q = editingId ? sb.from("players").update(row).eq("id", editingId) : sb.from("players").insert(row);
      const { error } = await q;
      if (error) throw error;
      closePlayer();
      toast(editingId ? "Jogador atualizado." : "Jogador adicionado.");
      await loadPlayers();
    } catch (e) {
      err.textContent = "Erro ao salvar: " + (e.message || e);
      err.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = "Salvar";
    }
  });

  $("#player-delete").addEventListener("click", async () => {
    const p = players.find((x) => x.id === editingId);
    if (!p || !confirm(`Excluir ${p.name} do elenco? Esta ação não pode ser desfeita.`)) return;
    const { error } = await sb.from("players").delete().eq("id", editingId);
    if (error) {
      $("#player-error").textContent = "Erro ao excluir: " + error.message;
      $("#player-error").hidden = false;
      return;
    }
    closePlayer();
    toast("Jogador excluído.");
    await loadPlayers();
  });

  // =====================================================================
  // DATAS (strings AAAA-MM-DD tratadas sem fuso horário)
  // =====================================================================
  const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const fmtDate = (s) => {
    const [y, m, d] = s.split("-");
    return `${d}/${m}/${y}`;
  };
  const weekday = (s) => {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
  };
  const hhmm = (t) => (t ? t.slice(0, 5) : "");

  function wireDialog(dialog, ...closers) {
    closers.forEach((b) => b.addEventListener("click", () => dialog.close()));
    dialog.addEventListener("click", (ev) => {
      if (ev.target === dialog) dialog.close();
    });
  }

  // =====================================================================
  // JOGOS
  // =====================================================================
  let matches = [];
  let editingMatchId = null;
  const mdlg = $("#match-dialog");

  async function loadMatches() {
    const { data, error } = await sb
      .from("matches")
      .select("*")
      .order("match_date", { ascending: false })
      .order("match_time", { ascending: false, nullsFirst: false });
    if (error) {
      $("#matches-count").textContent = "Não foi possível carregar os jogos.";
      return toast("Erro ao carregar jogos (rodou o supabase-jogos-treinos.sql?): " + error.message);
    }
    matches = data || [];
    renderMatches();
  }

  function matchResult(m) {
    if (m.status !== "Finalizado" || m.goals_for == null || m.goals_against == null) return null;
    return m.goals_for > m.goals_against ? "V" : m.goals_for < m.goals_against ? "D" : "E";
  }

  function renderMatches() {
    const f = $("#matches-filter").value;
    const q = val("#matches-search").toLowerCase();

    const done = matches.filter((m) => matchResult(m));
    const count = (r) => done.filter((m) => matchResult(m) === r).length;
    const stats = [
      ["Jogos", done.length],
      ["Vitórias", count("V")],
      ["Empates", count("E")],
      ["Derrotas", count("D")],
      ["Gols pró", done.reduce((s, m) => s + m.goals_for, 0)],
      ["Gols contra", done.reduce((s, m) => s + m.goals_against, 0)],
    ];
    $("#matches-stats").innerHTML = stats
      .map(([k, v]) => `<div class="stat"><div class="stat-v">${v}</div><div class="stat-k">${k}</div></div>`)
      .join("");

    const scheduled = matches.filter((m) => m.status === "Agendado").length;
    $("#matches-count").textContent = `${matches.length} jogo(s) · ${scheduled} agendado(s)`;

    const list = matches
      .filter((m) => {
        if (f === "next" && m.status !== "Agendado") return false;
        if (f === "done" && m.status !== "Finalizado") return false;
        if (!q) return true;
        return [m.opponent, m.competition, m.venue].some((v) => String(v ?? "").toLowerCase().includes(q));
      })
      .sort((a, b) => {
        const ka = a.match_date + (a.match_time || "");
        const kb = b.match_date + (b.match_time || "");
        return (f === "next" ? 1 : -1) * ka.localeCompare(kb);
      });

    $("#matches-empty").hidden = list.length > 0;
    $("#matches-list").innerHTML = list
      .map((m) => {
        const res = matchResult(m);
        const meta = [m.home_away, hhmm(m.match_time), m.competition, m.venue].filter(Boolean).join(" · ");
        const side = res
          ? `<span class="score">${m.goals_for} x ${m.goals_against}</span><span class="res ${res}">${res}</span>`
          : `<span class="badge ${esc(m.status)}">${esc(m.status)}</span>`;
        return `
        <button type="button" class="rowcard" data-id="${esc(m.id)}">
          <span class="datebox"><b>${esc(fmtDate(m.match_date).slice(0, 5))}</b><small>${esc(weekday(m.match_date))}</small></span>
          <span class="rc-main">
            <div class="rc-title">${esc(m.opponent)}</div>
            <div class="rc-meta">${esc(meta)}</div>
          </span>
          <span class="rc-side">${side}</span>
        </button>`;
      })
      .join("");
  }

  ["#matches-filter", "#matches-search"].forEach((s) => $(s).addEventListener("input", renderMatches));
  $("#matches-list").addEventListener("click", (ev) => {
    const c = ev.target.closest(".rowcard");
    if (c) openMatch(c.dataset.id);
  });

  function syncScore() {
    $("#m-score").hidden = $("#m-status").value !== "Finalizado";
  }
  $("#m-status").addEventListener("change", syncScore);

  function openMatch(id) {
    const m = id ? matches.find((x) => x.id === id) : null;
    editingMatchId = m ? m.id : null;
    $("#match-dialog-title").textContent = m ? "Editar jogo" : "Novo jogo";
    $("#m-date").value = m?.match_date || "";
    $("#m-time").value = hhmm(m?.match_time);
    $("#m-opponent").value = m?.opponent || "";
    $("#m-home").value = m?.home_away || "Casa";
    $("#m-status").value = m?.status || "Agendado";
    $("#m-competition").value = m?.competition || "";
    $("#m-venue").value = m?.venue || "";
    $("#m-gf").value = m?.goals_for ?? "";
    $("#m-ga").value = m?.goals_against ?? "";
    $("#m-notes").value = m?.notes || "";
    $("#match-delete").hidden = !m;
    $("#match-error").hidden = true;
    syncScore();
    mdlg.showModal();
  }

  $("#match-add").addEventListener("click", () => openMatch(null));
  wireDialog(mdlg, $("#match-close"), $("#match-cancel"));

  $("#match-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const err = $("#match-error");
    const btn = $("#match-save");
    err.hidden = true;

    const finished = $("#m-status").value === "Finalizado";
    if (finished && (val("#m-gf") === "" || val("#m-ga") === "")) {
      err.textContent = "Informe o placar para marcar o jogo como finalizado.";
      err.hidden = false;
      return;
    }

    btn.disabled = true;
    btn.textContent = "Salvando…";
    try {
      const row = {
        match_date: $("#m-date").value,
        match_time: orNull($("#m-time").value),
        opponent: val("#m-opponent"),
        home_away: $("#m-home").value,
        status: $("#m-status").value,
        competition: orNull(val("#m-competition")),
        venue: orNull(val("#m-venue")),
        goals_for: finished ? numOrNull(val("#m-gf")) : null,
        goals_against: finished ? numOrNull(val("#m-ga")) : null,
        notes: orNull(val("#m-notes")),
      };
      const { error } = editingMatchId
        ? await sb.from("matches").update(row).eq("id", editingMatchId)
        : await sb.from("matches").insert(row);
      if (error) throw error;
      mdlg.close();
      toast(editingMatchId ? "Jogo atualizado." : "Jogo adicionado.");
      await loadMatches();
    } catch (e) {
      err.textContent = "Erro ao salvar: " + (e.message || e);
      err.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = "Salvar";
    }
  });

  $("#match-delete").addEventListener("click", async () => {
    const m = matches.find((x) => x.id === editingMatchId);
    if (!m || !confirm(`Excluir o jogo contra ${m.opponent} (${fmtDate(m.match_date)})?`)) return;
    const { error } = await sb.from("matches").delete().eq("id", editingMatchId);
    if (error) {
      $("#match-error").textContent = "Erro ao excluir: " + error.message;
      $("#match-error").hidden = false;
      return;
    }
    mdlg.close();
    toast("Jogo excluído.");
    await loadMatches();
  });

  // =====================================================================
  // TREINOS
  // =====================================================================
  let trainings = [];
  let attendance = new Map(); // training_id -> Set(player_id)
  let editingTrainingId = null;
  const tdlg = $("#training-dialog");

  async function loadTrainings() {
    const [t, a] = await Promise.all([
      sb.from("trainings").select("*").order("training_date", { ascending: false }).order("start_time", { ascending: false, nullsFirst: false }),
      sb.from("training_attendance").select("training_id, player_id"),
    ]);
    if (t.error || a.error) {
      $("#trainings-count").textContent = "Não foi possível carregar os treinos.";
      return toast("Erro ao carregar treinos (rodou o supabase-jogos-treinos.sql?): " + (t.error || a.error).message);
    }
    trainings = t.data || [];
    attendance = new Map();
    (a.data || []).forEach((r) => {
      if (!attendance.has(r.training_id)) attendance.set(r.training_id, new Set());
      attendance.get(r.training_id).add(r.player_id);
    });
    renderTrainings();
  }

  function renderTrainings() {
    const f = $("#trainings-filter").value;
    const q = val("#trainings-search").toLowerCase();

    const held = trainings.filter((t) => t.status === "Realizado");
    const scheduled = trainings.filter((t) => t.status === "Agendado").length;
    const withPresence = held.filter((t) => (attendance.get(t.id)?.size || 0) > 0);
    const avg = withPresence.length
      ? (withPresence.reduce((s, t) => s + attendance.get(t.id).size, 0) / withPresence.length).toFixed(1).replace(".", ",")
      : "—";
    $("#trainings-stats").innerHTML = [
      ["Realizados", held.length],
      ["Agendados", scheduled],
      ["Média de presentes", avg],
    ]
      .map(([k, v]) => `<div class="stat"><div class="stat-v">${v}</div><div class="stat-k">${k}</div></div>`)
      .join("");
    $("#trainings-count").textContent = `${trainings.length} treino(s) · ${scheduled} agendado(s)`;

    const list = trainings
      .filter((t) => {
        if (f === "next" && t.status !== "Agendado") return false;
        if (f === "done" && t.status !== "Realizado") return false;
        if (!q) return true;
        return [t.focus, t.location].some((v) => String(v ?? "").toLowerCase().includes(q));
      })
      .sort((a, b) => {
        const ka = a.training_date + (a.start_time || "");
        const kb = b.training_date + (b.start_time || "");
        return (f === "next" ? 1 : -1) * ka.localeCompare(kb);
      });

    $("#trainings-empty").hidden = list.length > 0;
    $("#trainings-list").innerHTML = list
      .map((t) => {
        const hours = t.start_time ? hhmm(t.start_time) + (t.end_time ? "–" + hhmm(t.end_time) : "") : "";
        const meta = [hours, t.location].filter(Boolean).join(" · ");
        const present = attendance.get(t.id)?.size || 0;
        return `
        <button type="button" class="rowcard" data-id="${esc(t.id)}">
          <span class="datebox"><b>${esc(fmtDate(t.training_date).slice(0, 5))}</b><small>${esc(weekday(t.training_date))}</small></span>
          <span class="rc-main">
            <div class="rc-title">${esc(t.focus || "Treino")}</div>
            <div class="rc-meta">${esc(meta)}</div>
          </span>
          <span class="rc-side">
            ${present ? `<span class="presence">👥 ${present}</span>` : ""}
            <span class="badge ${esc(t.status)}">${esc(t.status)}</span>
          </span>
        </button>`;
      })
      .join("");
  }

  ["#trainings-filter", "#trainings-search"].forEach((s) => $(s).addEventListener("input", renderTrainings));
  $("#trainings-list").addEventListener("click", (ev) => {
    const c = ev.target.closest(".rowcard");
    if (c) openTraining(c.dataset.id);
  });

  function updateAttendanceCount() {
    const boxes = $$("#t-attendance input");
    const n = boxes.filter((b) => b.checked).length;
    $("#t-attendance-count").textContent = boxes.length ? `(${n} de ${boxes.length})` : "";
  }

  function renderAttendance(selected) {
    const list = players
      .filter((p) => p.status !== "Inativo" || selected.has(p.id))
      .sort((a, b) => (a.shirt_number ?? 999) - (b.shirt_number ?? 999) || a.name.localeCompare(b.name));
    $("#t-attendance").innerHTML =
      list
        .map(
          (p) => `
        <label class="check">
          <input type="checkbox" value="${esc(p.id)}" ${selected.has(p.id) ? "checked" : ""}>
          <span>${p.shirt_number != null ? esc(p.shirt_number) + " · " : ""}${esc(p.nickname || p.name)}</span>
        </label>`
        )
        .join("") || '<p class="muted small">Cadastre jogadores no elenco para registrar presença.</p>';
    updateAttendanceCount();
  }

  $("#t-attendance").addEventListener("change", updateAttendanceCount);
  $("#t-all").addEventListener("click", () => {
    const boxes = $$("#t-attendance input");
    const all = boxes.every((b) => b.checked);
    boxes.forEach((b) => (b.checked = !all));
    updateAttendanceCount();
  });

  function openTraining(id) {
    const t = id ? trainings.find((x) => x.id === id) : null;
    editingTrainingId = t ? t.id : null;
    $("#training-dialog-title").textContent = t ? "Editar treino" : "Novo treino";
    $("#t-date").value = t?.training_date || "";
    $("#t-status").value = t?.status || "Agendado";
    $("#t-start").value = hhmm(t?.start_time);
    $("#t-end").value = hhmm(t?.end_time);
    $("#t-location").value = t?.location || "";
    $("#t-focus").value = t?.focus || "";
    $("#t-notes").value = t?.notes || "";
    renderAttendance(new Set(t ? attendance.get(t.id) || [] : []));
    $("#training-delete").hidden = !t;
    $("#training-error").hidden = true;
    tdlg.showModal();
  }

  $("#training-add").addEventListener("click", () => openTraining(null));
  wireDialog(tdlg, $("#training-close"), $("#training-cancel"));

  $("#training-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const err = $("#training-error");
    const btn = $("#training-save");
    err.hidden = true;
    btn.disabled = true;
    btn.textContent = "Salvando…";
    try {
      const row = {
        training_date: $("#t-date").value,
        status: $("#t-status").value,
        start_time: orNull($("#t-start").value),
        end_time: orNull($("#t-end").value),
        location: orNull(val("#t-location")),
        focus: orNull(val("#t-focus")),
        notes: orNull(val("#t-notes")),
      };
      let id = editingTrainingId;
      if (id) {
        const { error } = await sb.from("trainings").update(row).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await sb.from("trainings").insert(row).select("id").single();
        if (error) throw error;
        id = data.id;
      }

      // presença: regrava a lista de presentes
      const present = $$("#t-attendance input:checked").map((i) => i.value);
      const del = await sb.from("training_attendance").delete().eq("training_id", id);
      if (del.error) throw del.error;
      if (present.length) {
        const ins = await sb.from("training_attendance").insert(present.map((pid) => ({ training_id: id, player_id: pid })));
        if (ins.error) throw ins.error;
      }

      tdlg.close();
      toast(editingTrainingId ? "Treino atualizado." : "Treino adicionado.");
      await loadTrainings();
    } catch (e) {
      err.textContent = "Erro ao salvar: " + (e.message || e);
      err.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = "Salvar";
    }
  });

  $("#training-delete").addEventListener("click", async () => {
    const t = trainings.find((x) => x.id === editingTrainingId);
    if (!t || !confirm(`Excluir o treino de ${fmtDate(t.training_date)}? A lista de presença também será apagada.`)) return;
    const { error } = await sb.from("trainings").delete().eq("id", editingTrainingId);
    if (error) {
      $("#training-error").textContent = "Erro ao excluir: " + error.message;
      $("#training-error").hidden = false;
      return;
    }
    tdlg.close();
    toast("Treino excluído.");
    await loadTrainings();
  });

  // ---------- init ----------
  (async () => {
    const { data } = await sb.auth.getSession();
    if (data.session) await enterApp(data.session);
    else showView("login");
  })();
})();
