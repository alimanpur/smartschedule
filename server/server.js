const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "2mb" }));

const DATA_PATH = path.join(__dirname, "data.json");

// Helpers
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
  };
}

function readData() {
  try {
    if (!fs.existsSync(DATA_PATH)) {
      const init = defaultState();
      fs.writeFileSync(DATA_PATH, JSON.stringify(init, null, 2));
      return init;
    }
    const raw = fs.readFileSync(DATA_PATH, "utf-8");
    return JSON.parse(raw);
  } catch (e) {
    return defaultState();
  }
}

function writeData(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

// In-memory sessions: token -> campus
const sessions = new Map();

app.get("/api/ping", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/login", (req, res) => {
  const { campus, username, password } = req.body || {};
  if (!campus || !username || !password) {
    return res.status(400).json({ error: "Missing fields" });
  }
  const data = readData();
  const campusData = data.campuses[campus];
  if (!campusData) return res.status(404).json({ error: "Campus not found" });
  const creds = campusData.credentials;
  if (username === creds.username && password === creds.password) {
    const token = crypto.randomBytes(24).toString("hex");
    sessions.set(token, campus);
    return res.json({ token, campus });
  }
  return res.status(401).json({ error: "Invalid credentials" });
});

function requireAuth(req, res, next) {
  const auth = req.get("Authorization") || "";
  const parts = auth.split(" ");
  if (parts[0] !== "Bearer" || !parts[1]) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const campus = sessions.get(parts[1]);
  if (!campus) return res.status(401).json({ error: "Unauthorized" });
  req.campus = campus;
  req.token = parts[1];
  next();
}

app.get("/api/campus/:campus", requireAuth, (req, res) => {
  if (req.params.campus !== req.campus) return res.status(403).json({ error: "Forbidden" });
  const data = readData();
  const campusData = data.campuses[req.params.campus];
  if (!campusData) return res.status(404).json({ error: "Campus not found" });
  res.json(campusData);
});

app.post("/api/campus/:campus", requireAuth, (req, res) => {
  if (req.params.campus !== req.campus) return res.status(403).json({ error: "Forbidden" });
  const data = readData();
  if (!data.campuses[req.params.campus]) return res.status(404).json({ error: "Campus not found" });
  const payload = req.body || {};
  // Basic shape validation
  const merged = {
    ...payload,
    config: {
      ...payload.config,
      campusCode: req.params.campus,
    },
  };
  data.campuses[req.params.campus] = merged;
  writeData(data);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Timetable backend running on http://localhost:${PORT}`);
});