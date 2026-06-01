const cars = {"Civic FN1 1.8 i-VTEC": {"engine": "R18A2", "fuel": "Essence", "power": 140, "torque": 174, "mass": 1265, "redline": 6800, "gearTopSpeed": 150, "cda": 0.7, "crr": 0.012, "loss": 15}, "Civic FN1 2.2 i-CTDi": {"engine": "N22A2", "fuel": "Diesel", "power": 140, "torque": 340, "mass": 1370, "redline": 4700, "gearTopSpeed": 145, "cda": 0.72, "crr": 0.012, "loss": 16}};

let selectedCar = "Civic FN1 2.2 i-CTDi";
let watchId = null;
let rows = [];
let bestHp = 0;
let bestTorque = 0;
let maxSpeed = 0;
let last = null;
let runStart = null;
let distance = 0;
let marks = { t0100: null, t400: null, t1000: null };

const g = 9.80665;
const rho = 1.225;
const $ = id => document.getElementById(id);
const fmt = (v, d = 1) => Number.isFinite(v) ? Number(v).toFixed(d) : "--";

function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  $(id).classList.add("active");
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.screen === id));
  if (id === "graphs") drawChart();
  if (id === "history") renderHistory();
  if (id === "compare") renderCompare();
}

function initCars() {
  const select = $("carSelect");
  Object.keys(cars).forEach(name => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });
  select.value = selectedCar;
  select.onchange = () => selectCar(select.value);
  $("driverMass").oninput = updateMass;
  selectCar(selectedCar);
  renderHistory();
  renderModels();
  drawChart();
}

function selectCar(name) {
  selectedCar = name;
  const car = cars[name];
  $("carSelect").value = name;
  $("fuel").value = car.fuel;
  $("homeCar").textContent = name;
  $("homeSpecs").textContent = car.power + " ch / " + car.torque + " Nm";
  $("resultCar").textContent = name;
  $("resultSpecs").textContent = car.power + " ch";
  $("gearTopSpeed").value = car.gearTopSpeed;
  updateMass();
  renderModels();
}

function updateMass() {
  const car = cars[selectedCar];
  $("totalMass").value = Math.round(car.mass + (+$("driverMass").value || 0));
}

function cfg() {
  const car = cars[selectedCar];
  return {
    mass: +$("totalMass").value || car.mass + 90,
    cda: car.cda,
    crr: car.crr,
    loss: car.loss / 100,
    redline: car.redline,
    gearTopSpeed: +$("gearTopSpeed").value || car.gearTopSpeed
  };
}

function resetRun() {
  rows = [];
  bestHp = 0;
  bestTorque = 0;
  maxSpeed = 0;
  last = null;
  runStart = null;
  distance = 0;
  marks = { t0100: null, t400: null, t1000: null };
  $("speed").textContent = "0";
  $("hp").textContent = "--";
  $("torque").textContent = "--";
  $("t0100").textContent = "--";
  $("t400live").textContent = "--";
}

function startRun() {
  resetRun();
  showScreen("run");
  if (!navigator.geolocation) {
    alert("GPS non disponible sur cet appareil.");
    return;
  }
  $("gpsStatus").textContent = "GPS actif";
  watchId = navigator.geolocation.watchPosition(sample, err => {
    alert("Erreur GPS : " + err.message);
  }, {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 5000
  });
}

function stopRun() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  $("gpsStatus").textContent = "GPS prêt";
  $("resultDate").textContent = new Date().toLocaleString();
  updateResults();
  showScreen("results");
}

function sample(pos) {
  const t = performance.now() / 1000;
  const speedMps = Math.max(0, pos.coords.speed ?? 0);
  if (!last) {
    last = { t, speedMps };
    return;
  }

  const dt = t - last.t;
  if (dt <= 0.15) return;

  let accel = (speedMps - last.speedMps) / dt;
  if (!Number.isFinite(accel)) accel = 0;

  const c = cfg();
  const v = speedMps;
  const kmh = v * 3.6;
  distance += Math.max(0, (v + last.speedMps) / 2 * dt);

  const force = c.mass * accel + c.mass * g * c.crr + 0.5 * rho * c.cda * v * v;
  const powerW = Math.max(0, force * v);
  const wheelHp = powerW / 745.7;
  const engineHp = wheelHp / (1 - c.loss);

  const rpm = Math.min(c.redline, Math.max(900, kmh * (c.redline / c.gearTopSpeed)));
  let torqueNm = engineHp * 745.7 / (rpm * 2 * Math.PI / 60);
  if (!Number.isFinite(torqueNm)) torqueNm = 0;

  bestHp = Math.max(bestHp, engineHp);
  bestTorque = Math.max(bestTorque, torqueNm);
  maxSpeed = Math.max(maxSpeed, kmh);

  if (runStart === null && kmh > 3) runStart = t;
  if (runStart !== null) {
    const elapsed = t - runStart;
    if (!marks.t0100 && kmh >= 100) marks.t0100 = elapsed;
    if (!marks.t400 && distance >= 400) marks.t400 = elapsed;
    if (!marks.t1000 && distance >= 1000) marks.t1000 = elapsed;
  }

  rows.push({ kmh, accel, wheelHp, engineHp, torqueNm, rpm, distance, time: t });
  updateLive(kmh, engineHp, torqueNm);
  last = { t, speedMps };
}

function updateLive(kmh, hp, torque) {
  $("speed").textContent = fmt(kmh, 0);
  $("hp").textContent = fmt(hp);
  $("torque").textContent = fmt(torque);
  $("t0100").textContent = fmt(marks.t0100, 2);
  $("t400live").textContent = fmt(marks.t400, 2);
}

function updateResults() {
  $("bestHp").textContent = fmt(bestHp);
  $("bestTorque").textContent = fmt(bestTorque);
  $("maxSpeed").textContent = fmt(maxSpeed, 0);
  $("t0100r").textContent = fmt(marks.t0100, 2);
  $("t400").textContent = fmt(marks.t400, 2);
  $("t1000").textContent = fmt(marks.t1000, 2);
  $("graphHp").textContent = fmt(bestHp);
  $("graphTorque").textContent = fmt(bestTorque);
  drawChart();
}

function saveRun() {
  const history = JSON.parse(localStorage.getItem("civicRuns") || "[]");
  history.unshift({
    date: new Date().toLocaleString(),
    model: selectedCar,
    bestHp,
    bestTorque,
    maxSpeed,
    t0100: marks.t0100,
    t400: marks.t400,
    t1000: marks.t1000,
    rows
  });
  localStorage.setItem("civicRuns", JSON.stringify(history.slice(0, 30)));
  renderHistory();
  alert("Run enregistré !");
}

function renderHistory() {
  const history = JSON.parse(localStorage.getItem("civicRuns") || "[]");
  $("historyList").innerHTML = history.length ? history.map(r => `
    <div class="listitem">
      <div>
        <small>${r.date}</small>
        <b>${r.model}</b>
      </div>
      <div class="right">
        <b class="red">${fmt(r.bestHp)} ch</b>
        <small class="blue">${fmt(r.bestTorque)} Nm</small>
      </div>
    </div>
  `).join("") : "<p>Aucun run enregistré.</p>";
}

function renderCompare() {
  const history = JSON.parse(localStorage.getItem("civicRuns") || "[]").slice(0, 5);
  $("compareList").innerHTML = history.length ? history.map(r => `
    <div class="listitem">
      <div>
        <b>${r.model}</b>
        <small>${r.date}</small>
      </div>
      <div class="right">
        <b class="red">${fmt(r.bestHp)} ch</b>
        <small class="blue">${fmt(r.bestTorque)} Nm</small>
      </div>
    </div>
  `).join("") : "<p>Enregistre plusieurs runs pour les comparer.</p>";
  drawCompare(history);
}

function renderModels() {
  $("modelList").innerHTML = Object.entries(cars).map(([name, car]) => `
    <div class="listitem" onclick="selectCar('${name}')">
      <div class="selected icon">🚗</div>
      <div>
        <b>${name}</b>
        <small>${car.engine} • ${car.power} ch • ${car.torque} Nm • ${car.fuel}</small>
      </div>
      <div class="right">${selectedCar === name ? "✓" : "›"}</div>
    </div>
  `).join("");
}

function drawGrid(ctx, w, h) {
  ctx.strokeStyle = "rgba(255,255,255,.12)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const y = i * h / 4;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

function drawLine(ctx, values, w, h, color, maxBase = 160) {
  if (!values.length) return;
  const max = Math.max(maxBase, ...values);
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  values.forEach((v, i) => {
    const x = i * w / Math.max(1, values.length - 1);
    const y = h - (v / max) * (h - 30) - 15;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function drawChart() {
  const canvas = $("chart");
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  drawGrid(ctx, w, h);
  const demo = [
    { engineHp: 35, torqueNm: 90 },
    { engineHp: 85, torqueNm: 200 },
    { engineHp: 118, torqueNm: 280 },
    { engineHp: 140, torqueNm: 320 },
    { engineHp: 110, torqueNm: 240 }
  ];
  const data = rows.length ? rows : demo;
  drawLine(ctx, data.map(r => r.engineHp), w, h, "#ef4444", 160);
  drawLine(ctx, data.map(r => r.torqueNm / 2.5), w, h, "#60a5fa", 160);
}

function drawCompare(history) {
  const canvas = $("compareChart");
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  drawGrid(ctx, w, h);
  history.forEach((run, i) => {
    const color = i % 2 ? "#60a5fa" : "#ef4444";
    drawLine(ctx, (run.rows || []).map(r => r.engineHp), w, h, color, 160);
  });
}

initCars();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
