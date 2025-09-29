(function () {
  const LS_KEY = "ttg_data_v1";
  const SS_KEY = "ttg_session";
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const qs = (sel) => document.querySelector(sel);
  const qsa = (sel) => Array.from(document.querySelectorAll(sel));

  // Backend integration (configurable base, falls back to local storage)
  let useBackend = false;
  let authToken = null;

  function getApiBase() {
    const url = (state.backendUrl || "").trim();
    return url || "http://localhost:3000/api";
  }

  async function apiFetch(path, method = "GET", body = null) {
    const headers = { "Content-Type": "application/json" };
    if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
    const res = await fetch(`${getApiBase()}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null,
    });
    return res;
  }

  async function tryBackendLogin(campus, username, password) {
    if (!state.serverEnabled || !(state.backendUrl || "").trim()) return null;
    try {
      const res = await apiFetch("/login", "POST", { campus, username, password });
      if (!res.ok) return null;
      const data = await res.json();
      authToken = data.token;
      useBackend = true;
      saveSession({ campus, username, token: authToken });
      const campusRes = await apiFetch(`/campus/${campus}`, "GET");
      if (campusRes.ok) {
        const campusDataObj = await campusRes.json();
        state.campuses[campus] = campusDataObj;
      }
      return data;
    } catch {
      return null;
    }
  }

  async function syncCampusToBackend() {
    if (!useBackend || !session || !state.serverEnabled) return;
    try {
      await apiFetch(`/campus/${session.campus}`, "POST", state.campuses[session.campus]);
    } catch {}
  }

  // Firebase integration (v12 modular via dynamic imports)
  function firebaseReady() {
    return !!(window._fbDb);
  }

  async function initFirebaseIfEnabled() {
    if (!state.firebaseEnabled) return;
    const cfg = state.firebaseConfig || {};
    if (!cfg.apiKey || !cfg.projectId || !cfg.appId) return;

    try {
      if (!window._fbMods) {
        const appMod = await import("https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js");
        const fsMod = await import("https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js");
        const authMod = await import("https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js");
        window._fbMods = {
          initializeApp: appMod.initializeApp,
          getApps: appMod.getApps,
          getApp: appMod.getApp,
          deleteApp: appMod.deleteApp,
          getFirestore: fsMod.getFirestore,
          enableIndexedDbPersistence: fsMod.enableIndexedDbPersistence,
          doc: fsMod.doc,
          getDoc: fsMod.getDoc,
          setDoc: fsMod.setDoc,
          getAuth: authMod.getAuth,
          signInWithEmailAndPassword: authMod.signInWithEmailAndPassword,
          setPersistence: authMod.setPersistence,
          browserLocalPersistence: authMod.browserLocalPersistence,
          signOut: authMod.signOut
        };
      }
      const M = window._fbMods;
      const apps = M.getApps();
      let app;
      if (apps && apps.length) {
        app = M.getApp();
      } else {
        app = M.initializeApp(cfg);
      }
      window._fbApp = app;
      window._fbDb = M.getFirestore(app);
      window._fbAuth = M.getAuth(app);
      try { await M.setPersistence(window._fbAuth, M.browserLocalPersistence); } catch {}
      try { await M.enableIndexedDbPersistence(window._fbDb); } catch {}
    } catch {}
  }

  async function fbLoadCampus(campus) {
    if (!state.firebaseEnabled) return null;
    await initFirebaseIfEnabled();
    const db = window._fbDb;
    if (!db) return null;
    try {
      const M = window._fbMods;
      const ref = M.doc(db, "campuses", campus);
      const snap = await M.getDoc(ref);
      if (snap.exists()) {
        state.campuses[campus] = snap.data();
        return state.campuses[campus];
      } else {
        const dc = defaultCampus(campus);
        await M.setDoc(ref, dc);
        state.campuses[campus] = dc;
        return dc;
      }
    } catch {
      return null;
    }
  }

  async function fbSaveCampus(campus) {
    if (!state.firebaseEnabled) return;
    await initFirebaseIfEnabled();
    const db = window._fbDb;
    if (!db) return;
    try {
      const M = window._fbMods;
      const ref = M.doc(db, "campuses", campus);
      await M.setDoc(ref, state.campuses[campus]);
    } catch {}
  }

  async function syncCampusToFirebase() {
    if (!session || !state.firebaseEnabled) return;
    try { await fbSaveCampus(session.campus); } catch {}
  }

  function uid(prefix = "") {
    return prefix + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function defaultCampus(campusCode) {
    return {
      credentials: {
        username: campusCode === "MAIN" ? "main_hod" : "off_hod",
        password: "admin123",
      },
      config: {
        collegeName: "Your College",
        campusCode,
        branches: [],
        semesters: [1, 2, 3, 4, 5, 6, 7, 8],
        startTime: "09:00",
        endTime: "17:00",
        lectureDuration: 60,
        lunchTime: "13:00",
        lunchDuration: 60,
        breaks: [],
        logoDataUrl: null,
        // Print/Export meta
        programTitle: "",
        termTitle: "",
        effectiveFrom: "",
        coordinatorName: "",
        roomNo: "",
        classCoordinator: ""
      },
      teachers: [],
      subjects: [],
      timetables: [],
    };
  }

  function defaultState() {
    return {
      campuses: {
        MAIN: defaultCampus("MAIN"),
        OFF: defaultCampus("OFF"),
      },
      // Backend/server config
      backendUrl: "",
      serverEnabled: false,
      // Firebase config (pre-filled with your project and enabled by default)
      firebaseEnabled: true,
      firebaseConfig: {
        apiKey: "AIzaSyBCrhTXWEyGiNyE-ZgOqw9VkB7taclVlOg",
        authDomain: "smartschedule-727d1.firebaseapp.com",
        projectId: "smartschedule-727d1",
        storageBucket: "smartschedule-727d1.firebasestorage.app",
        messagingSenderId: "957159641853",
        appId: "1:957159641853:web:d0e425ca3794ec9b476494",
        measurementId: "G-SBQFMTL2X3"
      }
    };
  }

  function loadState() {
    const raw = localStorage.getItem(LS_KEY);
    const base = defaultState();
    if (!raw) return base;
    try {
      const parsed = JSON.parse(raw);
      return { ...base, ...parsed };
    } catch {
      return base;
    }
  }

  async function refreshFromBackendIfPossible() {
    if (session && session.token && state.serverEnabled && (state.backendUrl || "").trim()) {
      authToken = session.token;
      useBackend = true;
      try {
        const res = await apiFetch(`/campus/${session.campus}`, "GET");
        if (res.ok) {
          state.campuses[session.campus] = await res.json();
        }
      } catch {}
    }
  }

  function saveState(stateObj) {
    localStorage.setItem(LS_KEY, JSON.stringify(stateObj));
    syncCampusToBackend();
    syncCampusToFirebase();
  }

  function loadSession() {
    const raw = sessionStorage.getItem(SS_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function saveSession(sess) {
    sessionStorage.setItem(SS_KEY, JSON.stringify(sess));
  }

  function clearSession() {
    sessionStorage.removeItem(SS_KEY);
  }

  const state = loadState();
  let session = loadSession();

  function currentCampus() {
    if (!session) return "MAIN";
    return session.campus;
  }
  function campusData() {
    return state.campuses[currentCampus()];
  }

  function parseTime(t) {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  }
  function formatTime(mins) {
    let h = Math.floor(mins / 60);
    let m = mins % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  function intersects(aStart, aEnd, bStart, bEnd) {
    return Math.max(aStart, bStart) < Math.min(aEnd, bEnd);
  }

  function generateSlots(cfg) {
    const start = parseTime(cfg.startTime);
    const end = parseTime(cfg.endTime);
    const dur = Number(cfg.lectureDuration);
    const lunchStart = parseTime(cfg.lunchTime);
    const lunchEnd = lunchStart + Number(cfg.lunchDuration);
    const extraBreaks = (cfg.breaks || []).map((b) => ({
      start: parseTime(b.time),
      end: parseTime(b.time) + Number(b.duration),
    }));
    const slots = [];
    let cur = start;
    while (cur + dur <= end) {
      const s = cur;
      const e = cur + dur;
      const isLunch = intersects(s, e, lunchStart, lunchEnd);
      const isExtraBreak = extraBreaks.some((br) => intersects(s, e, br.start, br.end));
      const breakType = isLunch ? "lunch" : (isExtraBreak ? "short" : null);
      slots.push({ start: s, end: e, label: `${formatTime(s)} - ${formatTime(e)}`, isBreak: !!breakType, breakType });
      cur += dur;
    }
    return slots;
  }

  function setView(viewId) {
    qsa(".view").forEach((v) => v.classList.remove("active"));
    qs(`#${viewId}`).classList.add("active");
  }
  function setSubview(id) {
    qsa(".subview").forEach((v) => v.classList.remove("active"));
    qs(`#${id}`).classList.add("active");
    qsa(".nav .nav-item").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-target") === id);
    });
    if (id === "dashboard-view") renderDashboard();
    if (id === "teachers-view") renderTeachers();
    if (id === "subjects-view") renderSubjects();
    if (id === "config-view") renderConfig();
    if (id === "timetable-view") renderTimetableControls();
  }

  function renderTopbar() {
    const c = campusData();
    qs("#college-name").textContent = c.config.collegeName || "Your College";
    qs("#campus-name").textContent = c.config.campusCode === "MAIN" ? "Main Campus" : "Off-Campus";
    qs("#username-display").textContent = c.credentials.username;
  }

  function renderDashboard() {
    const c = campusData();
    qs("#stat-teachers").textContent = c.teachers.length;
    qs("#stat-subjects").textContent = c.subjects.length;
    const hasTT = c.timetables && c.timetables.length > 0;
    qs("#stat-timetable").textContent = hasTT ? "Yes" : "No";
    const slots = generateSlots(c.config).filter((s) => !s.isBreak).length;
    const hours = ((slots * DAYS.length) * Number(c.config.lectureDuration)) / 60;
    qs("#stat-hours").textContent = hours;
  }

  function addTeacher() {
    const name = qs("#teacher-name").value.trim();
    const dept = qs("#teacher-dept").value.trim();
    if (!name) return;
    const t = { id: uid("t_"), name, dept, unavailability: [] };
    campusData().teachers.push(t);
    saveState(state);
    qs("#teacher-name").value = "";
    qs("#teacher-dept").value = "";
    renderTeachers();
    renderSubjects();
  }

  function renderTeachers() {
    const container = qs("#teachers-list");
    container.innerHTML = "";
    campusData().teachers.forEach((t) => {
      const row = document.createElement("div");
      row.className = "table-row";
      const nameDiv = document.createElement("div");
      nameDiv.textContent = t.name;
      const deptDiv = document.createElement("div");
      deptDiv.textContent = t.dept || "-";
      const actionsDiv = document.createElement("div");
      const btnAvail = document.createElement("button");
      btnAvail.className = "btn";
      btnAvail.textContent = "Availability";
      btnAvail.onclick = () => openAvailabilityModal(t);
      const btnEdit = document.createElement("button");
      btnEdit.className = "btn";
      btnEdit.textContent = "Edit";
      btnEdit.onclick = () => {
        const newName = prompt("Edit name", t.name);
        if (newName !== null && newName.trim()) t.name = newName.trim();
        const newDept = prompt("Edit department", t.dept || "");
        if (newDept !== null) t.dept = newDept.trim();
        saveState(state); renderTeachers(); renderSubjects();
      };
      const btnDel = document.createElement("button");
      btnDel.className = "btn danger";
      btnDel.textContent = "Delete";
      btnDel.onclick = () => {
        if (!confirm("Delete this teacher?")) return;
        const idx = campusData().teachers.findIndex((x) => x.id === t.id);
        campusData().teachers.splice(idx, 1);
        // remove from subjects
        campusData().subjects.forEach((s) => {
          s.teacherIds = (s.teacherIds || []).filter((id) => id !== t.id);
        });
        saveState(state); renderTeachers(); renderSubjects();
      };
      actionsDiv.append(btnAvail, btnEdit, btnDel);
      row.append(nameDiv, deptDiv, actionsDiv);
      container.append(row);
    });
  }

  function openAvailabilityModal(teacher) {
    const cfg = campusData().config;
    const slots = generateSlots(cfg);
    const modalBody = qs("#modal-body");
    modalBody.innerHTML = "";
    const grid = document.createElement("div");
    grid.className = "availability-grid";
    grid.style.setProperty("--cols", slots.length);
    const headerRow = document.createElement("div");
    headerRow.className = "row";
    const dayH = document.createElement("div");
    dayH.textContent = "";
    headerRow.append(dayH);
    slots.forEach((s) => {
      const h = document.createElement("div");
      h.className = "slot";
      h.textContent = s.label;
      headerRow.append(h);
    });
    grid.append(headerRow);
    DAYS.forEach((day, dIndex) => {
      const row = document.createElement("div");
      row.className = "row";
      const dayCell = document.createElement("div");
      dayCell.className = "slot";
      dayCell.textContent = day;
      row.append(dayCell);
      slots.forEach((s, sIndex) => {
        const slotCell = document.createElement("div");
        slotCell.className = "slot";
        const key = `${dIndex}-${sIndex}`;
        const unavailable = teacher.unavailability.includes(key);
        if (unavailable) slotCell.classList.add("unavailable");
        if (s.isBreak) slotCell.classList.add("break");
        slotCell.textContent = s.isBreak ? (s.breakType === "lunch" ? "Lunch" : "Break") : "";
        slotCell.onclick = () => {
          if (s.isBreak) return;
          const pos = teacher.unavailability.indexOf(key);
          if (pos >= 0) {
            teacher.unavailability.splice(pos, 1);
            slotCell.classList.remove("unavailable");
          } else {
            teacher.unavailability.push(key);
            slotCell.classList.add("unavailable");
          }
          saveState(state);
        };
        row.append(slotCell);
      });
      grid.append(row);
    });
    modalBody.append(grid);
    qs("#modal-title").textContent = `Availability: ${teacher.name}`;
    openModal();
  }

  function openModal() {
    qs("#modal-overlay").classList.add("active");
  }
  function closeModal() {
    qs("#modal-overlay").classList.remove("active");
  }

  function renderSubjects() {
    const palette = qs("#teacher-chips");
    palette.innerHTML = "";
    campusData().teachers.forEach((t) => {
      const chip = document.createElement("div");
      chip.className = "chip";
      chip.draggable = true;
      chip.textContent = `${t.name} (${t.dept || "-"})`;
      chip.dataset.teacherId = t.id;
      chip.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("application/json", JSON.stringify({ type: "teacher", teacherId: t.id }));
      });
      palette.append(chip);
    });

    const semSel = qs("#subject-sem");
    const cfg = campusData().config;
    semSel.innerHTML = "";
    (cfg.semesters || []).forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = `Semester ${s}`;
      semSel.append(opt);
    });

    const list = qs("#subjects-list");
    list.innerHTML = "";
    campusData().subjects.forEach((s) => {
      const card = document.createElement("div");
      card.className = "subject-card";
      const title = document.createElement("div");
      title.className = "title";
      title.textContent = `${s.code} — ${s.name}`;
      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = `${s.branch || "-"} | Sem ${s.semester} | ${s.sessionsPerWeek} sessions/week`;

      const actions = document.createElement("div");
      actions.style.marginTop = "6px";
      const btnEdit = document.createElement("button");
      btnEdit.className = "btn";
      btnEdit.textContent = "Edit";
      btnEdit.onclick = () => {
        const newName = prompt("Edit subject name", s.name);
        if (newName !== null && newName.trim()) s.name = newName.trim();
        const newBranch = prompt("Edit branch", s.branch || "");
        if (newBranch !== null) s.branch = newBranch.trim();
        const newSessions = prompt("Edit sessions per week", String(s.sessionsPerWeek));
        if (newSessions !== null && !isNaN(Number(newSessions))) s.sessionsPerWeek = Number(newSessions);
        saveState(state); renderSubjects();
      };
      const btnDel = document.createElement("button");
      btnDel.className = "btn danger";
      btnDel.textContent = "Delete";
      btnDel.onclick = () => {
        if (!confirm("Delete this subject?")) return;
        const idx = campusData().subjects.findIndex((x) => x.id === s.id);
        campusData().subjects.splice(idx, 1);
        saveState(state); renderSubjects(); renderTimetableControls();
      };
      actions.append(btnEdit, btnDel);

      const dzLabel = document.createElement("div");
      dzLabel.className = "palette-title";
      dzLabel.textContent = "Assigned teachers";
      const dropzone = document.createElement("div");
      dropzone.className = "dropzone";
      dropzone.addEventListener("dragover", (e) => e.preventDefault());
      dropzone.addEventListener("drop", (e) => {
        try {
          const data = JSON.parse(e.dataTransfer.getData("application/json"));
          if (data.type === "teacher") {
            const id = data.teacherId;
            s.teacherIds = s.teacherIds || [];
            if (!s.teacherIds.includes(id)) s.teacherIds.push(id);
            saveState(state); renderSubjects();
          }
        } catch {}
      });

      const assigned = document.createElement("div");
      assigned.className = "assigned";
      (s.teacherIds || []).forEach((tid) => {
        const t = campusData().teachers.find((x) => x.id === tid);
        if (!t) return;
        const chip = document.createElement("div");
        chip.className = "chip";
        chip.textContent = `${t.name} (${t.dept || "-"})`;
        const remove = document.createElement("button");
        remove.className = "btn icon";
        remove.textContent = "×";
        remove.onclick = () => {
          s.teacherIds = s.teacherIds.filter((x) => x !== tid);
          saveState(state); renderSubjects();
        };
        assigned.append(chip, remove);
      });

      card.append(title, meta, actions, dzLabel, dropzone, assigned);
      list.append(card);
    });
  }

  function addSubject() {
    const code = qs("#subject-code").value.trim();
    const name = qs("#subject-name").value.trim();
    const branch = qs("#subject-branch").value.trim();
    const semester = Number(qs("#subject-sem").value);
    const sessionsPerWeek = Number(qs("#sessions-per-week").value);
    if (!code || !name || !branch) return;
    const subj = { id: uid("s_"), code, name, branch, semester, sessionsPerWeek, teacherIds: [] };
    campusData().subjects.push(subj);
    saveState(state);
    qs("#subject-code").value = "";
    qs("#subject-name").value = "";
    qs("#subject-branch").value = "";
    qs("#sessions-per-week").value = "3";
    renderSubjects();
    renderTimetableControls();
  }

  function renderConfig() {
    const c = campusData();
    qs("#config-college-name").value = c.config.collegeName || "";
    qs("#config-campus").value = c.config.campusCode;
    qs("#config-campus").disabled = true;

    qs("#start-time").value = c.config.startTime;
    qs("#end-time").value = c.config.endTime;
    qs("#lecture-duration").value = String(c.config.lectureDuration);
    qs("#lunch-time").value = c.config.lunchTime;
    qs("#lunch-duration").value = String(c.config.lunchDuration);

    const branches = qs("#branches-list");
    branches.innerHTML = "";
    (c.config.branches || []).forEach((b, idx) => {
      const tag = document.createElement("div");
      tag.className = "tag";
      tag.textContent = b;
      const rm = document.createElement("button");
      rm.className = "remove";
      rm.textContent = "×";
      rm.onclick = () => {
        c.config.branches.splice(idx, 1);
        saveState(state); renderConfig(); renderTimetableControls();
      };
      tag.append(rm);
      branches.append(tag);
    });

    const semTags = qs("#semesters-list");
    semTags.innerHTML = "";
    (c.config.semesters || []).forEach((s) => {
      const tag = document.createElement("div");
      tag.className = "tag";
      tag.textContent = `Sem ${s}`;
      semTags.append(tag);
    });

    const breaks = qs("#breaks-list");
    breaks.innerHTML = "";
    (c.config.breaks || []).forEach((b, idx) => {
      const tag = document.createElement("div");
      tag.className = "tag";
      tag.textContent = `${b.time} (${b.duration}m)`;
      const rm = document.createElement("button");
      rm.className = "remove";
      rm.textContent = "×";
      rm.onclick = () => {
        c.config.breaks.splice(idx, 1);
        saveState(state); renderConfig();
      };
      tag.append(rm);
      breaks.append(tag);
    });

    const logoPreview = qs("#logo-preview");
    logoPreview.innerHTML = "";
    if (c.config.logoDataUrl) {
      const img = document.createElement("img");
      img.src = c.config.logoDataUrl;
      logoPreview.append(img);
    }

    // New: print/export meta
    qs("#wef-date").value = c.config.effectiveFrom || "";
    qs("#program-title").value = c.config.programTitle || "";
    qs("#term-title").value = c.config.termTitle || "";
    qs("#coordinator-name").value = c.config.coordinatorName || "";
    qs("#room-no").value = c.config.roomNo || "";
    qs("#class-coordinator").value = c.config.classCoordinator || "";

    // Backend/auth
    qs("#config-username").value = c.credentials.username;
    qs("#config-password").value = c.credentials.password;
    qs("#backend-url").value = state.backendUrl || "";
    qs("#enable-server").checked = !!state.serverEnabled;

    // Firebase
    if (qs("#fb-apiKey")) {
      const fbc = state.firebaseConfig || {};
      qs("#fb-apiKey").value = fbc.apiKey || "";
      qs("#fb-authDomain").value = fbc.authDomain || "";
      qs("#fb-projectId").value = fbc.projectId || "";
      qs("#fb-storageBucket").value = fbc.storageBucket || "";
      qs("#fb-messagingSenderId").value = fbc.messagingSenderId || "";
      qs("#fb-appId").value = fbc.appId || "";
      qs("#enable-firebase").checked = !!state.firebaseEnabled;
    }

    qs("#config-saved").textContent = "";
  }

  function saveConfig() {
    const c = campusData();
    c.config.collegeName = qs("#config-college-name").value.trim() || c.config.collegeName;
    c.config.startTime = qs("#start-time").value;
    c.config.endTime = qs("#end-time").value;
    c.config.lectureDuration = Number(qs("#lecture-duration").value);
    c.config.lunchTime = qs("#lunch-time").value;
    c.config.lunchDuration = Number(qs("#lunch-duration").value);

    // New meta
    c.config.effectiveFrom = qs("#wef-date").value || "";
    c.config.programTitle = qs("#program-title").value.trim();
    c.config.termTitle = qs("#term-title").value.trim();
    c.config.coordinatorName = qs("#coordinator-name").value.trim();
    c.config.roomNo = qs("#room-no").value.trim();
    c.config.classCoordinator = qs("#class-coordinator").value.trim();

    // Credentials
    c.credentials.username = qs("#config-username").value.trim() || c.credentials.username;
    c.credentials.password = qs("#config-password").value;

    // Backend
    state.backendUrl = (qs("#backend-url").value || "").trim();
    state.serverEnabled = qs("#enable-server").checked;

    // Firebase
    state.firebaseConfig = {
      apiKey: (qs("#fb-apiKey").value || "").trim(),
      authDomain: (qs("#fb-authDomain").value || "").trim(),
      projectId: (qs("#fb-projectId").value || "").trim(),
      storageBucket: (qs("#fb-storageBucket").value || "").trim(),
      messagingSenderId: (qs("#fb-messagingSenderId").value || "").trim(),
      appId: (qs("#fb-appId").value || "").trim()
    };
    state.firebaseEnabled = qs("#enable-firebase").checked;

    saveState(state);
    initFirebaseIfEnabled();
    qs("#config-saved").textContent = "Saved";
    renderTopbar();
  }

  function addBranch() {
    const input = qs("#config-branch-input");
    const val = input.value.trim();
    if (!val) return;
    const c = campusData();
    c.config.branches = c.config.branches || [];
    if (!c.config.branches.includes(val)) c.config.branches.push(val);
    saveState(state);
    input.value = "";
    renderConfig();
    renderTimetableControls();
  }

  function addBreak() {
    const t = qs("#break-time-input").value;
    const d = Number(qs("#break-duration-input").value);
    if (!t || !d) return;
    const c = campusData();
    c.config.breaks = c.config.breaks || [];
    c.config.breaks.push({ time: t, duration: d });
    saveState(state);
    qs("#break-time-input").value = "";
    qs("#break-duration-input").value = "";
    renderConfig();
  }

  function handleLogoUpload(ev) {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      campusData().config.logoDataUrl = reader.result;
      saveState(state); renderConfig();
    };
    reader.readAsDataURL(file);
  }

  function renderTimetableControls() {
    const c = campusData();
    const branchSel = qs("#tt-branch");
    const semSel = qs("#tt-sem");

    // Preserve current selections
    const prevBranch = branchSel.value;
    const prevSem = semSel.value;

    // Rebuild branch options
    branchSel.innerHTML = "";
    (c.config.branches || []).forEach((b) => {
      const opt = document.createElement("option");
      opt.value = b; opt.textContent = b;
      branchSel.append(opt);
    });
    // Restore branch selection if possible
    if (prevBranch && (c.config.branches || []).includes(prevBranch)) {
      branchSel.value = prevBranch;
    }

    // Rebuild semester options
    semSel.innerHTML = "";
    (c.config.semesters || []).forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s; opt.textContent = `Semester ${s}`;
      semSel.append(opt);
    });
    // Restore semester selection if possible
    if (prevSem && (c.config.semesters || []).map(String).includes(String(prevSem))) {
      semSel.value = prevSem;
    }

    // Determine active filters
    const activeBranch = branchSel.value || ((c.config.branches || [])[0] || "");
    const activeSem = Number(semSel.value || ((c.config.semesters || [])[0] || 1));

    // Populate subject checkboxes based on filters
    const subsSelect = qs("#tt-subjects-select");
    subsSelect.innerHTML = "";
    const subjects = c.subjects.filter((x) => x.branch === activeBranch && x.semester === activeSem);
    subjects.forEach((s) => {
      const ctr = document.createElement("label");
      ctr.style.display = "inline-flex"; ctr.style.alignItems = "center"; ctr.style.gap = "6px";
      const cb = document.createElement("input");
      cb.type = "checkbox"; cb.value = s.code; cb.checked = true;
      const text = document.createElement("span");
      text.textContent = `${s.code} — ${s.name}`;
      ctr.append(cb, text);
      subsSelect.append(ctr);
    });

    renderGrid(null); // reset
    renderSubjectsPalette(subjects);
    qs("#generation-status").textContent = "";
  }

  function renderSubjectsPalette(subjects) {
    const wrap = qs("#tt-subject-chips");
    wrap.innerHTML = "";
    subjects.forEach((s) => {
      const chip = document.createElement("div");
      chip.className = "chip";
      chip.textContent = `${s.code}`;
      chip.draggable = true;
      chip.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("application/json", JSON.stringify({ type: "paletteSubject", code: s.code }));
      });
      wrap.append(chip);
    });
  }

  function blankGrid(slots) {
    return DAYS.map(() => slots.map(() => null));
  }

  function subjectPrimaryTeacher(subject) {
    const tid = (subject.teacherIds || [])[0];
    if (!tid) return null;
    return campusData().teachers.find((t) => t.id === tid) || null;
  }

  function teacherUnavailableSet(teacher) {
    const set = new Set(teacher ? teacher.unavailability : []);
    return set;
  }

  function generateTimetable() {
    const c = campusData();
    const cfg = c.config;
    const slots = generateSlots(cfg);
    const selectedCodes = Array.from(qs("#tt-subjects-select").querySelectorAll("input[type=checkbox]"))
      .filter((cb) => cb.checked).map((cb) => cb.value);
    const branch = qs("#tt-branch").value;
    const semester = Number(qs("#tt-sem").value);
    const subjects = c.subjects.filter((s) => s.branch === branch && s.semester === semester && selectedCodes.includes(s.code));

    const grid = blankGrid(slots);
    const requests = [];
    subjects.forEach((s) => {
      const teacher = subjectPrimaryTeacher(s);
      requests.push({ subject: s, remaining: Number(s.sessionsPerWeek || 0), teacher });
    });

    const slotIndices = slots.map((_, i) => i);
    const dayIndices = DAYS.map((_, i) => i);

    for (let loopSafe = 0; loopSafe < 10000; loopSafe++) {
      const allDone = requests.every((r) => r.remaining <= 0);
      if (allDone) break;

      const r = requests.find((x) => x.remaining > 0);
      if (!r) break;

      let placed = false;
      for (const di of dayIndices) {
        for (const si of slotIndices) {
          const slot = slots[si];
          if (slot.isBreak) continue;
          if (grid[di][si] !== null) continue;
          const unavailable = r.teacher && teacherUnavailableSet(r.teacher).has(`${di}-${si}`);
          if (unavailable) continue;
          const left = si > 0 ? grid[di][si - 1] : null;
          if (left && left.code === r.subject.code) continue;
          grid[di][si] = { code: r.subject.code };
          r.remaining -= 1;
          placed = true;
          break;
        }
        if (placed) break;
      }
      if (!placed) {
        break;
      }
    }

    const unassigned = requests.filter((r) => r.remaining > 0);
    renderGrid({ grid, slots, branch, semester });
    renderSubjectsPalette(subjects);
    if (unassigned.length > 0) {
      qs("#generation-status").textContent = `Unassigned sessions remain: ${unassigned.map((x) => `${x.subject.code}(${x.remaining})`).join(", ")}`;
    } else {
      qs("#generation-status").textContent = "Generated.";
    }
    markConflicts();
  }

  function renderGrid(data) {
    const wrapper = qs("#timetable-grid");
    wrapper.innerHTML = "";
    const cfg = campusData().config;
    const slots = data ? data.slots : generateSlots(cfg);
    const grid = data ? data.grid : blankGrid(slots);
    wrapper.style.setProperty("--cols", String(slots.length));

    // Header
    const headerRow = document.createElement("div");
    headerRow.className = "row";
    const dayHeader = document.createElement("div");
    dayHeader.className = "cell header";
    dayHeader.textContent = "Day \\ Time";
    headerRow.append(dayHeader);
    slots.forEach((s) => {
      const cell = document.createElement("div");
      cell.className = "cell header";
      cell.textContent = s.label;
      headerRow.append(cell);
    });
    wrapper.append(headerRow);

    DAYS.forEach((day, di) => {
      const row = document.createElement("div");
      row.className = "row";
      const dayCell = document.createElement("div");
      dayCell.className = "cell day";
      dayCell.textContent = day;
      row.append(dayCell);

      slots.forEach((s, si) => {
        const cell = document.createElement("div");
        cell.className = "cell slot";
        if (s.isBreak) cell.classList.add("break");
        cell.dataset.dayIndex = String(di);
        cell.dataset.slotIndex = String(si);

        if (!s.isBreak) {
          cell.addEventListener("dragover", (e) => {
            e.preventDefault();
          });
          cell.addEventListener("drop", onDropOnSlot);
        }

        const val = grid[di][si];
        if (!s.isBreak && val && val.code) {
          const chip = document.createElement("div");
          chip.className = "chip";
          chip.textContent = val.code;
          chip.draggable = true;
          chip.addEventListener("dragstart", (e) => {
            const payload = { type: "gridSubject", from: { di, si } };
            e.dataTransfer.setData("application/json", JSON.stringify(payload));
          });
          cell.append(chip);
        } else {
          cell.classList.add("empty");
          if (s.isBreak) cell.textContent = s.breakType === "lunch" ? "Lunch" : "Break";
          if (!s.isBreak) cell.textContent = "";
        }

        row.append(cell);
      });
      wrapper.append(row);
    });
  }

  function onDropOnSlot(e) {
    try {
      const payload = JSON.parse(e.dataTransfer.getData("application/json"));
      const di = Number(e.currentTarget.dataset.dayIndex);
      const si = Number(e.currentTarget.dataset.slotIndex);
      const cfg = campusData().config;
      const slots = generateSlots(cfg);

      const grid = captureGridFromDom(slots.length);
      if (slots[si].isBreak) return;

      if (payload.type === "paletteSubject") {
        grid[di][si] = { code: payload.code };
      }
      if (payload.type === "gridSubject") {
        const from = payload.from;
        const destVal = grid[di][si];
        grid[di][si] = grid[from.di][from.si];
        grid[from.di][from.si] = destVal || null;
      }
      renderGrid({ grid, slots, branch: qs("#tt-branch").value, semester: Number(qs("#tt-sem").value) });
      markConflicts();
    } catch {}
  }

  function captureGridFromDom(slotCount) {
    const rows = qsa("#timetable-grid .row");
    const grid = DAYS.map(() => Array.from({ length: slotCount }, () => null));
    rows.slice(1).forEach((row, di) => {
      const cells = row.querySelectorAll(".cell.slot");
      cells.forEach((cell, si) => {
        const chip = cell.querySelector(".chip");
        grid[di][si] = chip ? { code: chip.textContent.trim() } : null;
      });
    });
    return grid;
  }

  function markConflicts() {
    const c = campusData();
    const slots = generateSlots(c.config);
    const rows = qsa("#timetable-grid .row").slice(1);
    rows.forEach((row, di) => {
      const cells = row.querySelectorAll(".cell.slot");
      cells.forEach((cell, si) => {
        cell.classList.remove("conflict");
        if (slots[si].isBreak) return;
        const chip = cell.querySelector(".chip");
        if (!chip) return;
        const code = chip.textContent.trim();
        const subj = c.subjects.find((s) => s.code === code);
        const teacher = subjectPrimaryTeacher(subj);
        if (!teacher) return;
        const unavailable = teacherUnavailableSet(teacher).has(`${di}-${si}`);
        if (unavailable) cell.classList.add("conflict");
      });
    });
  }

  function saveTimetable() {
    const c = campusData();
    const cfg = c.config;
    const slots = generateSlots(cfg);
    const grid = captureGridFromDom(slots.length);
    const branch = qs("#tt-branch").value;
    const semester = Number(qs("#tt-sem").value);
    const existingIdx = c.timetables.findIndex((t) => t.branch === branch && t.semester === semester);
    const data = { branch, semester, grid, slots };
    if (existingIdx >= 0) c.timetables[existingIdx] = data;
    else c.timetables.push(data);
    saveState(state);
    qs("#generation-status").textContent = "Saved.";
    renderDashboard();
  }

  function clearTimetable() {
    renderGrid(null);
    qs("#generation-status").textContent = "Cleared.";
  }

  function uniqueSubjectsFor(branch, semester) {
    const c = campusData();
    return c.subjects.filter((s) => s.branch === branch && s.semester === semester);
  }

  function teacherNameForSubject(s) {
    const t = subjectPrimaryTeacher(s);
    return t ? t.name : "";
  }

  function buildExportHTML({ grid, slots, branch, semester }) {
    const c = campusData();
    const meta = c.config;
    const times = slots.map((s) => s.label);
    const dayRows = DAYS.map((day, di) => {
      const tds = slots.map((s, si) => {
        if (s.isBreak) {
          const lab = s.breakType === "lunch" ? "LUNCH BREAK" : "SHORT BREAK";
          return `<td class="break"><div class="vertical">${lab}</div></td>`;
        }
        const cell = grid[di][si];
        return `<td>${cell && cell.code ? cell.code : ""}</td>`;
      }).join("");
      return `<tr><th class="day">${day.toUpperCase()}</th>${tds}</tr>`;
    }).join("");

    const subjRows = uniqueSubjectsFor(branch, semester).map((s) => {
      const fac = teacherNameForSubject(s);
      return `<tr><td>${s.code}</td><td>${s.name}</td><td>${fac}</td></tr>`;
    }).join("");

    const logoImg = meta.logoDataUrl ? `<img class="logo" src="${meta.logoDataUrl}" />` : "";

    return `
<style>
  .export-wrap { font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #000; }
  .header { text-align: center; }
  .inst { font-weight: 700; font-size: 16px; }
  .college { font-weight: 700; font-size: 20px; }
  .sub { font-size: 13px; }
  .meta { display: flex; justify-content: space-between; font-size: 12px; margin: 6px 0; }
  .logo { height: 60px; float: left; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th, td { border: 1px solid #111; padding: 6px; text-align: center; vertical-align: middle; font-size: 12px; }
  th.day { width: 110px; }
  thead th { font-weight: 700; }
  td.break { position: relative; background: #fafafa; width: 54px; }
  .vertical { writing-mode: vertical-rl; transform: rotate(180deg); font-weight: 700; color: #444; }
  .footer { display: grid; grid-template-columns: 1fr 340px; gap: 12px; margin-top: 14px; }
  .map table td, .map table th { font-size: 12px; }
  .right td { text-align: left; }
  .label { width: 140px; font-weight: 700; }
  .title { font-weight: 700; text-transform: uppercase; margin: 6px 0; }
</style>
<div class="export-wrap">
  ${logoImg}
  <div class="header">
    <div class="college">${meta.collegeName || "Your College"}</div>
    <div class="inst">INSTITUTE OF ENGINEERING & SCIENCE ${meta.campusCode === "OFF" ? "OFF CAMPUS - 1" : ""}</div>
    <div class="sub">${meta.programTitle || ""}</div>
    <div class="title">${meta.termTitle || "TIME-TABLE"}</div>
  </div>
  <div class="meta">
    <div>W.E.F.: ${meta.effectiveFrom || ""}</div>
    <div>Coordinator: ${meta.coordinatorName || ""}</div>
    <div>Room No.: ${meta.roomNo || ""}</div>
  </div>
  <table class="tt">
    <thead>
      <tr>
        <th>DAY / TIME</th>
        ${times.map((t) => `<th>${t}</th>`).join("")}
      </tr>
    </thead>
    <tbody>
      ${dayRows}
    </tbody>
  </table>
  <div class="footer">
    <div class="map">
      <table>
        <thead><tr><th>Subject Code</th><th>Subject Name</th><th>Faculty Name</th></tr></thead>
        <tbody>${subjRows}</tbody>
      </table>
    </div>
    <div class="right">
      <table>
        <tr><td class="label">Class Coordinator</td><td>${meta.classCoordinator || ""}</td></tr>
        <tr><td class="label">Branch</td><td>${branch}</td></tr>
        <tr><td class="label">Semester</td><td>${semester}</td></tr>
      </table>
    </div>
  </div>
</div>`;
  }

  async function exportPDF() {
    const c = campusData();
    const cfg = c.config;
    const slots = generateSlots(cfg);
    const grid = captureGridFromDom(slots.length);
    const branch = qs("#tt-branch").value;
    const sem = Number(qs("#tt-sem").value);

    // Build hidden export container
    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.left = "-9999px";
    container.style.top = "0";
    container.style.width = "1120px";
    container.innerHTML = buildExportHTML({ grid, slots, branch, semester: sem });
    document.body.appendChild(container);

    const { jsPDF } = window.jspdf;
    const canvas = await html2canvas(container, { scale: 2, backgroundColor: "#ffffff" });
    const imgData = canvas.toDataURL("image/png");

    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const margin = 20;
    const pageWidth = doc.internal.pageSize.getWidth() - margin * 2;
    const pageHeight = doc.internal.pageSize.getHeight() - margin * 2;

    const imgW = canvas.width;
    const imgH = canvas.height;
    const scale = Math.min(pageWidth / imgW, pageHeight / imgH);
    const renderW = imgW * scale;
    const renderH = imgH * scale;

    doc.addImage(imgData, "PNG", margin, margin, renderW, renderH);
    doc.save(`Timetable_${branch}_Sem${sem}.pdf`);

    document.body.removeChild(container);
  }

  function exportExcel() {
    if (typeof XLSX === "undefined" || !XLSX || !XLSX.utils) {
      qs("#generation-status").textContent = "Excel export library not loaded.";
      return;
    }
    const c = campusData();
    const cfg = c.config;
    const slots = generateSlots(cfg);
    const grid = captureGridFromDom(slots.length);
    const branch = qs("#tt-branch").value;
    const sem = Number(qs("#tt-sem").value);

    const N = slots.length + 1; // +1 for Day column
    const aoa = [];
    const merges = [];

    // Title rows
    aoa.push([c.config.collegeName || "Your College"]);
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: N - 1 } });

    aoa.push(["INSTITUTE OF ENGINEERING & SCIENCE" + (c.config.campusCode === "OFF" ? " OFF CAMPUS - 1" : "")]);
    merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: N - 1 } });

    aoa.push([c.config.programTitle || ""]);
    merges.push({ s: { r: 2, c: 0 }, e: { r: 2, c: N - 1 } });

    aoa.push([c.config.termTitle || "TIME-TABLE"]);
    merges.push({ s: { r: 3, c: 0 }, e: { r: 3, c: N - 1 } });

    aoa.push([`W.E.F.: ${c.config.effectiveFrom || ""}`, "", "", "", `Coordinator: ${c.config.coordinatorName || ""}`, "", "", "", `Room No.: ${c.config.roomNo || ""}`]);
    // No merges for this detail row to keep it simple

    // Header row
    aoa.push(["DAY / TIME", ...slots.map((s) => s.label)]);

    // Day rows
    DAYS.forEach((day, di) => {
      const row = [day.toUpperCase()];
      slots.forEach((s, si) => {
        if (s.isBreak) row.push(s.breakType === "lunch" ? "LUNCH BREAK" : "SHORT BREAK");
        else {
          const cell = grid[di][si];
          row.push(cell && cell.code ? cell.code : "");
        }
      });
      aoa.push(row);
    });

    // Blank row
    aoa.push([]);

    // Subject mapping
    aoa.push(["Subject Code", "Subject Name", "Faculty Name"]);
    uniqueSubjectsFor(branch, sem).forEach((s) => {
      aoa.push([s.code, s.name, teacherNameForSubject(s)]);
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!merges"] = merges;
    ws["!cols"] = Array.from({ length: N }, () => ({ wch: 16 }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Timetable");
    XLSX.writeFile(wb, `Timetable_${branch}_Sem${sem}.xlsx`);
    qs("#generation-status").textContent = "Excel exported.";
  }

  function printTimetable() {
    const c = campusData();
    const cfg = c.config;
    const slots = generateSlots(cfg);
    const grid = captureGridFromDom(slots.length);
    const branch = qs("#tt-branch").value;
    const sem = Number(qs("#tt-sem").value);

    const w = window.open("", "_blank");
    if (!w) {
      return;
    }
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Timetable Print</title>
  <style>
    @page { margin: 12mm; }
    body { margin: 10px; font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #000; }
  </style>
</head>
<body>
${buildExportHTML({ grid, slots, branch, semester: sem })}
<script>window.onload = function(){ window.print(); setTimeout(function(){ window.close(); }, 200); };</script>
</body>
</html>`;
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  async function login() {
    const campus = qs("#login-campus").value;
    const u = qs("#login-username").value.trim();
    const p = qs("#login-password").value;

    // Firebase first if enabled
    if (state.firebaseEnabled) {
      await initFirebaseIfEnabled();

      // Try Firebase Auth (email/password). Use email in the username field.
      if (window._fbAuth && u && p && u.includes("@")) {
        try {
          const M = window._fbMods;
          const cred = await M.signInWithEmailAndPassword(window._fbAuth, u, p);
          session = { campus, username: u, uid: cred.user && cred.user.uid };
          saveSession(session);
          qs("#login-error").textContent = "";
          await fbLoadCampus(campus); // pull latest campus data post-auth
          setView("main-view");
          renderTopbar();
          setSubview("dashboard-view");
          return;
        } catch (e) {
          // Fall through to Firestore-stored credentials
        }
      }

      // Fallback to credentials stored in Firestore campus document
      const loaded = await fbLoadCampus(campus);
      if (loaded) {
        const creds = loaded.credentials;
        if (u === creds.username && p === creds.password) {
          session = { campus, username: u };
          saveSession(session);
          qs("#login-error").textContent = "";
          setView("main-view");
          renderTopbar();
          setSubview("dashboard-view");
          return;
        }
      }
      qs("#login-error").textContent = "Invalid credentials";
      return;
    }

    // Try backend first (only if enabled and url provided)
    const backendResult = await tryBackendLogin(campus, u, p);
    if (backendResult) {
      session = { campus, username: u, token: authToken };
      qs("#login-error").textContent = "";
      setView("main-view");
      renderTopbar();
      setSubview("dashboard-view");
      return;
    }

    // Fallback to local credentials
    const creds = state.campuses[campus].credentials;
    if (u === creds.username && p === creds.password) {
      session = { campus, username: u };
      saveSession(session);
      qs("#login-error").textContent = "";
      setView("main-view");
      renderTopbar();
      setSubview("dashboard-view");
    } else {
      qs("#login-error").textContent = "Invalid credentials";
    }
  }

  function logout() {
    clearSession();
    session = null;
    authToken = null;
    useBackend = false;
    setView("login-view");
  }

  function exportDataJson() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "timetable_data.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function importDataJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(reader.result);
        if (!obj || !obj.campuses) throw new Error("Invalid data");
        // Replace state
        Object.assign(state, defaultState(), obj);
        saveState(state);
        renderTopbar();
        setSubview("dashboard-view");
        qs("#generation-status").textContent = "Data imported.";
      } catch {
        alert("Invalid JSON file.");
      }
    };
    reader.readAsText(file);
  }

  async function init() {
    qs("#login-button").addEventListener("click", () => login());
    qs("#logout-button").addEventListener("click", logout);
    qs("#modal-close").addEventListener("click", closeModal);

    qsa(".nav .nav-item").forEach((btn) => {
      btn.addEventListener("click", () => setSubview(btn.getAttribute("data-target")));
    });

    qs("#add-teacher-button").addEventListener("click", addTeacher);
    qs("#add-subject-button").addEventListener("click", addSubject);

    qs("#add-branch-button").addEventListener("click", addBranch);
    qs("#add-break-button").addEventListener("click", addBreak);
    qs("#logo-input").addEventListener("change", handleLogoUpload);
    qs("#save-config-button").addEventListener("click", saveConfig);

    const exportBtn = qs("#export-data-button");
    if (exportBtn) exportBtn.addEventListener("click", exportDataJson);
    const importInput = qs("#import-data-input");
    if (importInput) importInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) importDataJson(e.target.files[0]);
    });
    const testFb = qs("#test-firebase-button");
    if (testFb) testFb.addEventListener("click", async () => {
      await initFirebaseIfEnabled();
      qs("#config-saved").textContent = window._fbDb ? "Firebase connected." : "Firebase not configured.";
    });
    const syncNow = qs("#sync-now-button");
    if (syncNow) syncNow.addEventListener("click", async () => {
      await syncCampusToFirebase();
      qs("#config-saved").textContent = "Synced with Firebase.";
    });

    qs("#tt-branch").addEventListener("change", renderTimetableControls);
    qs("#tt-sem").addEventListener("change", renderTimetableControls);

    qs("#generate-button").addEventListener("click", generateTimetable);
    qs("#save-timetable-button").addEventListener("click", saveTimetable);
    qs("#clear-timetable-button").addEventListener("click", clearTimetable);
    qs("#pdf-button").addEventListener("click", exportPDF);
    qs("#excel-button").addEventListener("click", exportExcel);
    qs("#print-button").addEventListener("click", printTimetable);

    // If Firebase enabled, initialize and optionally refresh campus data
    if (state.firebaseEnabled) {
      await initFirebaseIfEnabled();
      if (session) {
        await fbLoadCampus(session.campus);
      }
    }

    // If a backend session exists and backend enabled, refresh campus state
    if (session && session.token && state.serverEnabled) {
      authToken = session.token;
      useBackend = true;
      try {
        const res = await apiFetch(`/campus/${session.campus}`, "GET");
        if (res.ok) {
          state.campuses[session.campus] = await res.json();
        }
      } catch {}
    }

    if (session) {
      setView("main-view");
      renderTopbar();
      setSubview("dashboard-view");
    } else {
      setView("login-view");
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();