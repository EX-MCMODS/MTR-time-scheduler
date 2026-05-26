import {
  generateCsv,
  generateMtrRealtimeText,
  generatePlanJson,
  generateTimetable,
  makeDefaultProject,
  MTR_RAIL_SPEEDS,
  normalizeProject,
  secondsToTime,
  uid
} from "./scheduler.js";

const STORAGE_KEY = "mtr-time-scheduler.project.v1";
const state = {
  project: normalizeProject(loadProject()),
  generated: null,
  selectedStationId: null,
  previewStationId: null,
  activeOutput: "diagram",
  drag: null,
  dragFrame: 0
};

state.generated = generateTimetable(state.project);
state.selectedStationId = state.project.stations[0]?.id || null;
state.previewStationId = state.selectedStationId;

const $ = (selector, root = document) => root.querySelector(selector);

document.addEventListener("DOMContentLoaded", () => {
  $("#fileImport").addEventListener("change", handleImport);
  document.body.addEventListener("click", handleClick);
  document.body.addEventListener("change", handleChange);

  const svg = $("#networkSvg");
  svg.addEventListener("pointerdown", handleSvgPointerDown);
  svg.addEventListener("pointermove", handleSvgPointerMove);
  svg.addEventListener("pointerup", handleSvgPointerUp);
  svg.addEventListener("pointercancel", handleSvgPointerUp);

  renderAll();
});

function loadProject() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : makeDefaultProject();
  } catch {
    return makeDefaultProject();
  }
}

function persistProject() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.project));
}

function regenerate() {
  state.project = normalizeProject(state.project);
  state.generated = generateTimetable(state.project);
  if (!state.project.stations.some((station) => station.id === state.selectedStationId)) {
    state.selectedStationId = state.project.stations[0]?.id || null;
  }
  if (!state.project.stations.some((station) => station.id === state.previewStationId)) {
    state.previewStationId = state.selectedStationId;
  }
  persistProject();
}

function renderAll() {
  renderTopbar();
  renderSidebar();
  renderNetwork();
  renderOutputs();
}

function renderTopbar() {
  const tripCount = state.generated.trips.length;
  const waitCount = state.generated.waitEvents.length;
  const conflictCount = state.generated.conflictEvents.length;
  const mode = getEditorMode();
  $("#statusLine").innerHTML = `
    <span>${tripCount}本</span>
    <span>${waitCount}待避</span>
    <span>${conflictCount}調整</span>
  `;
  $("#modeToggle").innerHTML = `
    <button class="${mode === "simple" ? "is-active" : ""}" data-action="set-mode" data-mode="simple">簡単</button>
    <button class="${mode === "expert" ? "is-active" : ""}" data-action="set-mode" data-mode="expert">エキスパート</button>
  `;
}

function renderSidebar() {
  renderSettings();
  renderStationList();
  renderStationEditor();
  renderSegments();
  renderServices();
  if (isExpertMode()) {
    renderWaitRules();
    $("#waitRulesPanel").hidden = false;
  } else {
    $("#waitRulesPanel").hidden = true;
  }
}

function renderSettings() {
  const settings = state.project.settings;
  const expertFields = isExpertMode()
    ? `
      <div class="field-row">
        <label>
          <span>走行余裕 秒</span>
          <input type="number" min="0" step="5" data-scope="settings" data-field="runTimePaddingSeconds" value="${attr(settings.runTimePaddingSeconds)}">
        </label>
        <label>
          <span>番線間隔 秒</span>
          <input type="number" min="0" step="5" data-scope="settings" data-field="minPlatformHeadwaySeconds" value="${attr(settings.minPlatformHeadwaySeconds)}">
        </label>
      </div>
    `
    : "";
  $("#settingsPanel").innerHTML = `
    <label>
      <span>路線名</span>
      <input data-scope="settings" data-field="routeName" value="${attr(settings.routeName)}">
    </label>
    ${expertFields}
    <label class="check-line">
      <input type="checkbox" data-scope="settings" data-field="firstLastAlwaysStop" ${settings.firstLastAlwaysStop ? "checked" : ""}>
      <span>始発/終着は全等級停車</span>
    </label>
  `;
}

function renderStationList() {
  $("#stationList").innerHTML = state.project.stations
    .map((station, index) => {
      const selected = station.id === state.selectedStationId ? "is-selected" : "";
      return `
        <button class="station-pill ${selected}" data-action="select-station" data-station-id="${attr(station.id)}">
          <span>${index + 1}</span>
          <strong>${html(station.name)}</strong>
        </button>
      `;
    })
    .join("");
}

function renderStationEditor() {
  const station = getSelectedStation();
  if (!station) {
    $("#stationEditor").innerHTML = "";
    return;
  }

  const serviceRows = state.project.services.map((service) => renderStationServiceRow(station, service)).join("");
  const serviceHead = isExpertMode()
    ? `<tr><th>等級</th><th>停車</th><th>番線</th><th>停車秒</th></tr>`
    : `<tr><th>等級</th><th>停車</th></tr>`;
  const expertStationFields = isExpertMode()
    ? `
      <div class="field-row">
        <label>
          <span>番線数</span>
          <input type="number" min="1" step="1" data-scope="station" data-field="tracks" value="${attr(station.tracks)}">
        </label>
        <label>
          <span>標準番線</span>
          <input data-scope="station" data-field="defaultPlatform" value="${attr(station.defaultPlatform)}">
        </label>
      </div>
    `
    : "";

  $("#stationEditor").innerHTML = `
    <div class="section-head">
      <h2>駅</h2>
      <div class="icon-actions">
        <button class="icon-button" data-action="add-station" title="駅を追加">+</button>
        <button class="icon-button danger" data-action="delete-station" title="駅を削除">×</button>
      </div>
    </div>
    <label>
      <span>駅名</span>
      <input data-scope="station" data-field="name" value="${attr(station.name)}">
    </label>
    ${expertStationFields}
    <table class="data-table station-service-table">
      <thead>${serviceHead}</thead>
      <tbody>${serviceRows}</tbody>
    </table>
  `;
}

function renderStationServiceRow(station, service) {
  if (!isExpertMode()) {
    return `
      <tr>
        <td><span class="swatch" style="--swatch:${attr(service.color)}"></span>${html(service.name)}</td>
        <td><input type="checkbox" data-scope="station-service" data-service-id="${attr(service.id)}" data-field="stop" ${station.stopByService[service.id] ? "checked" : ""}></td>
      </tr>
    `;
  }

  return `
    <tr>
      <td><span class="swatch" style="--swatch:${attr(service.color)}"></span>${html(service.name)}</td>
      <td><input type="checkbox" data-scope="station-service" data-service-id="${attr(service.id)}" data-field="stop" ${station.stopByService[service.id] ? "checked" : ""}></td>
      <td><input data-scope="station-service" data-service-id="${attr(service.id)}" data-field="platform" value="${attr(station.platformByService[service.id])}"></td>
      <td><input type="number" min="0" step="5" data-scope="station-service" data-service-id="${attr(service.id)}" data-field="dwell" value="${attr(station.dwellSecondsByService[service.id])}"></td>
    </tr>
  `;
}

function renderSegments() {
  const rows = state.project.segments
    .map((segment, index) => {
      const from = state.project.stations[index];
      const to = state.project.stations[index + 1];
      return `
        <tr>
          <td>${html(from.name)} → ${html(to.name)}</td>
          <td><input type="number" min="1" step="10" data-scope="segment" data-index="${index}" data-field="distanceM" value="${attr(segment.distanceM)}"></td>
          <td>${renderRailSpeedSelect(segment.speedLimitKph, index)}</td>
        </tr>
      `;
    })
    .join("");

  $("#segmentsPanel").innerHTML = `
    <div class="section-head"><h2>駅間</h2><button class="icon-button" data-action="auto-layout" title="整列">↔</button></div>
    <table class="data-table segment-table">
      <thead><tr><th>区間</th><th>距離</th><th>制限</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderServices() {
  const rows = state.project.services
    .map((service) => renderServiceRow(service))
    .join("");

  const header = isExpertMode()
    ? `<div class="service-header expert-service-header">
        <span></span><span></span><span>名</span><span>優先</span><span>km/h</span><span>始発</span><span>終発</span><span>分</span><span>停車</span><span></span>
      </div>`
    : `<div class="service-header simple-service-header">
        <span></span><span></span><span>名</span><span>km/h</span><span>始発</span><span>終発</span><span>分</span><span></span>
      </div>`;

  $("#servicesPanel").innerHTML = `
    <div class="section-head"><h2>等級</h2><button class="icon-button" data-action="add-service" title="等級を追加">+</button></div>
    ${header}
    ${rows}
  `;
}

function renderServiceRow(service) {
  if (!isExpertMode()) {
    return `
      <div class="service-row simple-service-row">
        <input type="checkbox" data-scope="service" data-service-id="${attr(service.id)}" data-field="active" ${service.active ? "checked" : ""} title="有効">
        <input type="color" data-scope="service" data-service-id="${attr(service.id)}" data-field="color" value="${attr(service.color)}" title="色">
        <input data-scope="service" data-service-id="${attr(service.id)}" data-field="name" value="${attr(service.name)}" title="等級名">
        <input type="number" min="5" step="5" data-scope="service" data-service-id="${attr(service.id)}" data-field="maxSpeedKph" value="${attr(service.maxSpeedKph)}" title="速度">
        <input data-scope="service" data-service-id="${attr(service.id)}" data-field="firstDeparture" value="${attr(service.firstDeparture)}" title="始発">
        <input data-scope="service" data-service-id="${attr(service.id)}" data-field="lastDeparture" value="${attr(service.lastDeparture)}" title="終発">
        <input type="number" min="1" step="1" data-scope="service" data-service-id="${attr(service.id)}" data-field="headwayMinutes" value="${attr(service.headwayMinutes)}" title="間隔">
        <button class="icon-button danger" data-action="delete-service" data-service-id="${attr(service.id)}" title="等級を削除">×</button>
      </div>
    `;
  }

  return `
    <div class="service-row expert-service-row">
      <input type="checkbox" data-scope="service" data-service-id="${attr(service.id)}" data-field="active" ${service.active ? "checked" : ""} title="有効">
      <input type="color" data-scope="service" data-service-id="${attr(service.id)}" data-field="color" value="${attr(service.color)}" title="色">
      <input data-scope="service" data-service-id="${attr(service.id)}" data-field="name" value="${attr(service.name)}" title="等級名">
      <input type="number" min="1" step="1" data-scope="service" data-service-id="${attr(service.id)}" data-field="priority" value="${attr(service.priority)}" title="優先">
      <input type="number" min="5" step="5" data-scope="service" data-service-id="${attr(service.id)}" data-field="maxSpeedKph" value="${attr(service.maxSpeedKph)}" title="速度">
      <input data-scope="service" data-service-id="${attr(service.id)}" data-field="firstDeparture" value="${attr(service.firstDeparture)}" title="始発">
      <input data-scope="service" data-service-id="${attr(service.id)}" data-field="lastDeparture" value="${attr(service.lastDeparture)}" title="終発">
      <input type="number" min="1" step="1" data-scope="service" data-service-id="${attr(service.id)}" data-field="headwayMinutes" value="${attr(service.headwayMinutes)}" title="間隔">
      <input type="number" min="0" step="5" data-scope="service" data-service-id="${attr(service.id)}" data-field="defaultDwellSeconds" value="${attr(service.defaultDwellSeconds)}" title="標準停車">
      <button class="icon-button danger" data-action="delete-service" data-service-id="${attr(service.id)}" title="等級を削除">×</button>
    </div>
  `;
}

function renderWaitRules() {
  const rules = state.project.waitRules.length
    ? state.project.waitRules
        .map((rule) => {
          const eventList = state.generated.waitEvents
            .filter((event) => event.ruleId === rule.id)
            .slice(0, 4)
            .map((event) => `<li>${html(event.waitingTrip)} ${html(event.stationName)} ${secondsToTime(event.newDeparture)}</li>`)
            .join("");
          return `
            <div class="wait-rule">
              <div class="wait-rule-grid">
                <input type="checkbox" data-scope="wait" data-rule-id="${attr(rule.id)}" data-field="active" ${rule.active ? "checked" : ""} title="有効">
                ${select("stationId", rule.id, rule.stationId, state.project.stations.map((station) => [station.id, station.name]), "wait")}
                ${select("waitingServiceId", rule.id, rule.waitingServiceId, state.project.services.map((service) => [service.id, `${service.name} 待ち`]), "wait")}
                ${select("passingServiceId", rule.id, rule.passingServiceId, state.project.services.map((service) => [service.id, `${service.name} 通過`]), "wait")}
                <input type="number" min="0" step="1" data-scope="wait" data-rule-id="${attr(rule.id)}" data-field="lookAheadMinutes" value="${attr(rule.lookAheadMinutes)}" title="探索分">
                <input type="number" min="0" step="5" data-scope="wait" data-rule-id="${attr(rule.id)}" data-field="bufferSeconds" value="${attr(rule.bufferSeconds)}" title="余裕秒">
                <button class="icon-button danger" data-action="delete-wait-rule" data-rule-id="${attr(rule.id)}" title="待避を削除">×</button>
              </div>
              ${eventList ? `<ul class="event-list">${eventList}</ul>` : ""}
            </div>
          `;
        })
        .join("")
    : `<div class="empty-note">未設定</div>`;

  $("#waitRulesPanel").innerHTML = `
    <div class="section-head"><h2>待避</h2><button class="icon-button" data-action="add-wait-rule" title="待避を追加">+</button></div>
    ${rules}
  `;
}

function renderNetwork() {
  const svg = $("#networkSvg");
  const segments = state.project.segments
    .map((segment, index) => {
      const from = state.project.stations[index];
      const to = state.project.stations[index + 1];
      const midX = (from.x + to.x) / 2;
      const midY = (from.y + to.y) / 2;
      return `
        <g class="segment" data-action="edit-segment-distance" data-segment-index="${index}">
          <line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}"></line>
          <rect x="${midX - 46}" y="${midY - 16}" width="92" height="28" rx="8"></rect>
          <text x="${midX}" y="${midY - 2}">${html(segment.distanceM)}m</text>
          <text class="segment-speed" x="${midX}" y="${midY + 11}">${html(getRailSpeedLabel(segment.speedLimitKph))}</text>
        </g>
      `;
    })
    .join("");

  const nodes = state.project.stations
    .map((station, index) => {
      const selected = station.id === state.selectedStationId ? "is-selected" : "";
      const stopCount = state.project.services.filter((service) => station.stopByService[service.id]).length;
      return `
        <g class="station-node ${selected}" data-station-id="${attr(station.id)}" transform="translate(${station.x} ${station.y})">
          <rect x="-60" y="-30" width="120" height="60" rx="8"></rect>
          <circle cx="-48" cy="-18" r="8"></circle>
          <text class="station-name" x="0" y="-2">${html(station.name)}</text>
          <text class="station-meta" x="0" y="18">${index + 1} / ${stopCount}等級</text>
        </g>
      `;
    })
    .join("");

  svg.innerHTML = `
    <defs>
      <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
        <path d="M 24 0 L 0 0 0 24" fill="none"></path>
      </pattern>
    </defs>
    <rect class="grid-bg" x="0" y="0" width="1000" height="520"></rect>
    ${segments}
    ${nodes}
  `;
}

function renderOutputs() {
  renderOutputTabs();
  const panel = $("#outputPanel");
  if (state.activeOutput === "diagram") {
    panel.innerHTML = renderTimeDistanceDiagram();
  } else if (state.activeOutput === "preview") {
    panel.innerHTML = renderStationPreview();
  } else if (state.activeOutput === "table") {
    panel.innerHTML = renderTimetableTable();
  } else {
    const text = getActiveOutputText();
    panel.innerHTML = `<textarea class="output-text" readonly>${html(text)}</textarea>`;
  }
}

function renderOutputTabs() {
  const tabs = [
    ["diagram", "ダイヤ"],
    ["preview", "駅プレビュー"],
    ["table", "時刻表"],
    ["mtr", "MTR"],
    ["csv", "CSV"],
    ["json", "JSON"]
  ];
  $("#outputTabs").innerHTML = tabs
    .map(([id, label]) => `<button class="${state.activeOutput === id ? "is-active" : ""}" data-action="select-output" data-output="${id}">${label}</button>`)
    .join("");
}

function renderTimeDistanceDiagram() {
  const trips = state.generated.trips;
  if (!trips.length) return `<div class="empty-note">生成対象なし</div>`;

  const stationCount = state.project.stations.length;
  const width = 980;
  const height = Math.max(320, stationCount * 58 + 80);
  const left = 92;
  const right = 24;
  const top = 32;
  const bottom = 48;
  const minTime = Math.min(...trips.map((trip) => trip.firstDeparture));
  const maxTime = Math.max(...trips.map((trip) => trip.lastArrival));
  const span = Math.max(1, maxTime - minTime);
  const xFor = (time) => left + ((time - minTime) / span) * (width - left - right);
  const yFor = (index) => top + (index / Math.max(1, stationCount - 1)) * (height - top - bottom);

  const stationLines = state.project.stations
    .map((station, index) => {
      const y = yFor(index);
      return `
        <g>
          <line class="chart-grid-line" x1="${left}" y1="${y}" x2="${width - right}" y2="${y}"></line>
          <text class="chart-label" x="12" y="${y + 4}">${html(station.name)}</text>
        </g>
      `;
    })
    .join("");

  const hourMarks = [];
  const firstHour = Math.floor(minTime / 3600) * 3600;
  for (let time = firstHour; time <= maxTime + 3600; time += 1800) {
    const x = xFor(time);
    if (x < left || x > width - right) continue;
    hourMarks.push(`
      <g>
        <line class="chart-time-line" x1="${x}" y1="${top - 14}" x2="${x}" y2="${height - bottom}"></line>
        <text class="chart-time" x="${x}" y="${height - 18}">${secondsToTime(time).slice(0, 5)}</text>
      </g>
    `);
  }

  const tripLines = trips
    .map((trip) => {
      const points = trip.stopTimes
        .map((stopTime, index) => `${xFor(stopTime.arrival).toFixed(1)},${yFor(index).toFixed(1)}`)
        .join(" ");
      const last = trip.stopTimes.at(-1);
      const labelX = xFor(last.arrival);
      const labelY = yFor(trip.stopTimes.length - 1);
      return `
        <g class="trip-line">
          <polyline points="${points}" style="--line:${attr(trip.service.color)}"></polyline>
          <text x="${labelX + 4}" y="${labelY - 4}" style="--line:${attr(trip.service.color)}">${html(trip.tripName)}</text>
        </g>
      `;
    })
    .join("");

  const waits = state.generated.waitEvents
    .map((event) => {
      const stationIndex = state.project.stations.findIndex((station) => station.id === event.stationId);
      if (stationIndex < 0) return "";
      return `<circle class="wait-dot" cx="${xFor(event.newDeparture)}" cy="${yFor(stationIndex)}" r="5"><title>${html(event.waitingTrip)} ${html(event.stationName)}</title></circle>`;
    })
    .join("");

  return `
    <svg class="time-diagram" viewBox="0 0 ${width} ${height}" role="img" aria-label="time distance diagram">
      ${stationLines}
      ${hourMarks.join("")}
      ${tripLines}
      ${waits}
    </svg>
  `;
}

function renderTimetableTable() {
  const maxRows = 500;
  const rows = [];
  state.generated.trips.forEach((trip) => {
    trip.stopTimes.forEach((stopTime) => {
      rows.push(`
        <tr>
          <td><span class="swatch" style="--swatch:${attr(trip.service.color)}"></span>${html(trip.tripName)}</td>
          <td>${html(stopTime.stationName)}</td>
          <td>${secondsToTime(stopTime.arrival)}</td>
          <td>${secondsToTime(stopTime.departure)}</td>
          <td>${html(stopTime.platform)}</td>
          <td>${stopTime.stop ? "停車" : "通過"}</td>
          <td>${html(stopTime.waitReason || stopTime.conflictReason || "")}</td>
        </tr>
      `);
    });
  });

  const visibleRows = rows.slice(0, maxRows).join("");
  const overflow = rows.length > maxRows ? `<caption>${rows.length - maxRows}行を省略</caption>` : "";
  return `
    <div class="table-scroll">
      <table class="data-table wide-table">
        ${overflow}
        <thead><tr><th>列車</th><th>駅</th><th>着</th><th>発</th><th>番線</th><th>扱い</th><th>調整</th></tr></thead>
        <tbody>${visibleRows}</tbody>
      </table>
    </div>
  `;
}

function renderStationPreview() {
  const station = getPreviewStation();
  if (!station) return `<div class="empty-note">駅がありません</div>`;

  const stopRows = state.generated.trips
    .map((trip) => {
      const stopTime = trip.stopTimes.find((item) => item.stationId === station.id);
      return stopTime ? { trip, stopTime } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.stopTime.arrival - b.stopTime.arrival || a.trip.service.priority - b.trip.service.priority);

  const stopCount = stopRows.filter(({ stopTime }) => stopTime.stop).length;
  const passCount = stopRows.length - stopCount;
  const waitCount = stopRows.filter(({ stopTime }) => stopTime.waitReason || stopTime.conflictReason).length;

  return `
    <div class="preview-page">
      <div class="preview-head">
        <label>
          <span>表示駅</span>
          <select data-scope="preview" data-field="stationId">
            ${state.project.stations.map((item) => `<option value="${attr(item.id)}" ${item.id === station.id ? "selected" : ""}>${html(item.name)}</option>`).join("")}
          </select>
        </label>
        <div class="preview-metrics">
          <span>${stopRows.length}本</span>
          <span>${stopCount}停車</span>
          <span>${passCount}通過</span>
          <span>${waitCount}調整</span>
        </div>
      </div>
      <div class="station-board">
        <table class="data-table wide-table">
          <thead><tr><th>時刻</th><th>列車</th><th>等級</th><th>番線</th><th>扱い</th><th>調整</th></tr></thead>
          <tbody>
            ${stopRows.map(({ trip, stopTime }) => `
              <tr class="${stopTime.stop ? "" : "is-pass"}">
                <td><strong>${secondsToTime(stopTime.arrival)}</strong><span class="depart-time">${stopTime.departure !== stopTime.arrival ? `発 ${secondsToTime(stopTime.departure)}` : ""}</span></td>
                <td>${html(trip.tripName)}</td>
                <td><span class="swatch" style="--swatch:${attr(trip.service.color)}"></span>${html(trip.service.name)}</td>
                <td>${html(stopTime.platform)}</td>
                <td>${stopTime.stop ? "停車" : "通過"}</td>
                <td>${html(stopTime.waitReason || stopTime.conflictReason || "")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function getActiveOutputText() {
  if (state.activeOutput === "mtr") return generateMtrRealtimeText(state.generated);
  if (state.activeOutput === "csv") return generateCsv(state.generated);
  if (state.activeOutput === "json") return generatePlanJson(state.generated);
  return "";
}

function handleClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const action = button.dataset.action;
  if (action === "select-station") {
    state.selectedStationId = button.dataset.stationId;
    renderSidebar();
    renderNetwork();
    return;
  }
  if (action === "select-output") {
    state.activeOutput = button.dataset.output;
    renderOutputs();
    return;
  }
  if (action === "set-mode") {
    state.project.settings.editorMode = button.dataset.mode === "expert" ? "expert" : "simple";
    regenerate();
    renderAll();
    return;
  }
  if (action === "add-station") {
    addStation();
  } else if (action === "delete-station") {
    deleteSelectedStation();
  } else if (action === "auto-layout") {
    autoLayout();
  } else if (action === "add-service") {
    addService();
  } else if (action === "delete-service") {
    deleteService(button.dataset.serviceId);
  } else if (action === "add-wait-rule") {
    addWaitRule();
  } else if (action === "delete-wait-rule") {
    deleteWaitRule(button.dataset.ruleId);
  } else if (action === "reset-sample") {
    state.project = makeDefaultProject();
    state.selectedStationId = state.project.stations[0].id;
  } else if (action === "copy-output") {
    copyActiveOutput();
    return;
  } else if (action === "download-output") {
    downloadActiveOutput();
    return;
  } else if (action === "download-project") {
    downloadText("mtr-time-scheduler-project.json", JSON.stringify(state.project, null, 2), "application/json");
    return;
  } else if (action === "import-project") {
    $("#fileImport").click();
    return;
  } else if (action === "edit-segment-distance") {
    editSegmentDistance(Number(button.dataset.segmentIndex));
    return;
  }

  regenerate();
  renderAll();
}

function handleChange(event) {
  const input = event.target;
  const scope = input.dataset.scope;
  if (!scope) return;

  const value = input.type === "checkbox" ? input.checked : input.type === "number" ? Number(input.value) : input.value;

  if (scope === "settings") {
    state.project.settings[input.dataset.field] = value;
  } else if (scope === "station") {
    const station = getSelectedStation();
    if (station) station[input.dataset.field] = value;
  } else if (scope === "station-service") {
    updateStationService(input.dataset.serviceId, input.dataset.field, value);
  } else if (scope === "segment") {
    const segment = state.project.segments[Number(input.dataset.index)];
    if (segment) segment[input.dataset.field] = value;
  } else if (scope === "service") {
    const service = state.project.services.find((item) => item.id === input.dataset.serviceId);
    if (service) service[input.dataset.field] = value;
  } else if (scope === "wait") {
    const rule = state.project.waitRules.find((item) => item.id === input.dataset.ruleId);
    if (rule) rule[input.dataset.field] = value;
  } else if (scope === "preview") {
    state.previewStationId = value;
    renderOutputs();
    return;
  }

  regenerate();
  renderAll();
}

function updateStationService(serviceId, field, value) {
  const station = getSelectedStation();
  if (!station) return;
  if (field === "stop") station.stopByService[serviceId] = value;
  if (field === "platform") station.platformByService[serviceId] = value;
  if (field === "dwell") station.dwellSecondsByService[serviceId] = value;
}

function addStation() {
  const selectedIndex = state.project.stations.findIndex((station) => station.id === state.selectedStationId);
  const index = selectedIndex >= 0 ? selectedIndex : state.project.stations.length - 1;
  const before = state.project.stations[index];
  const after = state.project.stations[index + 1];
  const serviceDefaults = Object.fromEntries(state.project.services.map((service) => [service.id, true]));
  const dwellDefaults = Object.fromEntries(state.project.services.map((service) => [service.id, service.defaultDwellSeconds]));
  const platformDefaults = Object.fromEntries(state.project.services.map((service) => [service.id, "1"]));
  const station = {
    id: uid("st"),
    name: `新駅${state.project.stations.length + 1}`,
    x: after ? (before.x + after.x) / 2 : before.x + 160,
    y: after ? (before.y + after.y) / 2 + 48 : before.y,
    tracks: 2,
    defaultPlatform: "1",
    stopByService: serviceDefaults,
    dwellSecondsByService: dwellDefaults,
    platformByService: platformDefaults
  };

  state.project.stations.splice(index + 1, 0, station);
  const oldSegment = state.project.segments[index];
  if (after && oldSegment) {
    const half = Math.max(1, Math.round(oldSegment.distanceM / 2));
    state.project.segments.splice(index, 1, { id: uid("seg"), distanceM: half, speedLimitKph: oldSegment.speedLimitKph }, { id: uid("seg"), distanceM: oldSegment.distanceM - half, speedLimitKph: oldSegment.speedLimitKph });
  } else {
    state.project.segments.splice(index, 0, { id: uid("seg"), distanceM: 1000, speedLimitKph: 90 });
  }
  state.selectedStationId = station.id;
}

function deleteSelectedStation() {
  if (state.project.stations.length <= 2) return;
  const index = state.project.stations.findIndex((station) => station.id === state.selectedStationId);
  if (index < 0) return;
  state.project.stations.splice(index, 1);
  if (index === 0) {
    state.project.segments.splice(0, 1);
  } else if (index >= state.project.segments.length) {
    state.project.segments.splice(index - 1, 1);
  } else {
    const mergedDistance = Number(state.project.segments[index - 1]?.distanceM || 0) + Number(state.project.segments[index]?.distanceM || 0);
    const speedLimitKph = Math.min(Number(state.project.segments[index - 1]?.speedLimitKph || 90), Number(state.project.segments[index]?.speedLimitKph || 90));
    state.project.segments.splice(index - 1, 2, { id: uid("seg"), distanceM: mergedDistance || 1000, speedLimitKph });
  }
  state.project.waitRules = state.project.waitRules.filter((rule) => state.project.stations.some((station) => station.id === rule.stationId));
  state.selectedStationId = state.project.stations[Math.max(0, index - 1)].id;
}

function autoLayout() {
  const count = state.project.stations.length;
  state.project.stations.forEach((station, index) => {
    station.x = count === 1 ? 500 : 100 + (index / (count - 1)) * 800;
    station.y = index % 2 ? 168 : 248;
  });
}

function addService() {
  const service = {
    id: uid("svc"),
    name: `等級${state.project.services.length + 1}`,
    color: ["#7b4fd6", "#bf6b00", "#0a7f8c", "#c02e68"][state.project.services.length % 4],
    priority: state.project.services.length + 1,
    active: true,
    maxSpeedKph: 90,
    firstDeparture: "07:00:00",
    lastDeparture: "09:00:00",
    headwayMinutes: 15,
    defaultDwellSeconds: 40
  };
  state.project.services.push(service);
  state.project.stations.forEach((station) => {
    station.stopByService[service.id] = true;
    station.dwellSecondsByService[service.id] = service.defaultDwellSeconds;
    station.platformByService[service.id] = station.defaultPlatform || "1";
  });
}

function deleteService(serviceId) {
  if (state.project.services.length <= 1) return;
  state.project.services = state.project.services.filter((service) => service.id !== serviceId);
  state.project.stations.forEach((station) => {
    delete station.stopByService[serviceId];
    delete station.dwellSecondsByService[serviceId];
    delete station.platformByService[serviceId];
  });
  state.project.waitRules = state.project.waitRules.filter((rule) => rule.waitingServiceId !== serviceId && rule.passingServiceId !== serviceId);
}

function addWaitRule() {
  const services = [...state.project.services].sort((a, b) => a.priority - b.priority);
  const waiting = services.at(-1);
  const passing = services[0];
  if (!waiting || !passing || waiting.id === passing.id) return;
  const station = getSelectedStation() || state.project.stations[Math.floor(state.project.stations.length / 2)];
  state.project.waitRules.push({
    id: uid("wait"),
    active: true,
    stationId: station.id,
    waitingServiceId: waiting.id,
    passingServiceId: passing.id,
    lookAheadMinutes: 10,
    bufferSeconds: 60
  });
}

function deleteWaitRule(ruleId) {
  state.project.waitRules = state.project.waitRules.filter((rule) => rule.id !== ruleId);
}

function renderRailSpeedSelect(value, index) {
  return `
    <select data-scope="segment" data-index="${index}" data-field="speedLimitKph">
      ${MTR_RAIL_SPEEDS.map((preset) => `<option value="${preset.speedKph}" ${Number(value) === preset.speedKph ? "selected" : ""}>${html(preset.label)}</option>`).join("")}
    </select>
  `;
}

function getRailSpeedLabel(speedKph) {
  const preset = MTR_RAIL_SPEEDS.find((item) => item.speedKph === Number(speedKph));
  return preset ? `${preset.connector} ${preset.speedKph}` : `${speedKph}km/h`;
}

function editSegmentDistance(index) {
  const segment = state.project.segments[index];
  if (!segment) return;
  const next = window.prompt("距離", String(segment.distanceM));
  if (next === null) return;
  const number = Number(next);
  if (Number.isFinite(number) && number > 0) {
    segment.distanceM = Math.round(number);
    regenerate();
    renderAll();
  }
}

function handleSvgPointerDown(event) {
  const node = event.target.closest(".station-node");
  if (!node) return;
  const station = state.project.stations.find((item) => item.id === node.dataset.stationId);
  if (!station) return;
  const point = svgPoint(event);
  state.selectedStationId = station.id;
  state.drag = {
    pointerId: event.pointerId,
    stationId: station.id,
    offsetX: point.x - station.x,
    offsetY: point.y - station.y
  };
  $("#networkSvg").setPointerCapture(event.pointerId);
  renderSidebar();
  renderNetwork();
}

function handleSvgPointerMove(event) {
  if (!state.drag || event.pointerId !== state.drag.pointerId) return;
  const station = state.project.stations.find((item) => item.id === state.drag.stationId);
  if (!station) return;
  const point = svgPoint(event);
  station.x = clamp(point.x - state.drag.offsetX, 60, 940);
  station.y = clamp(point.y - state.drag.offsetY, 60, 460);

  if (!state.dragFrame) {
    state.dragFrame = requestAnimationFrame(() => {
      state.dragFrame = 0;
      renderNetwork();
    });
  }
}

function handleSvgPointerUp(event) {
  if (!state.drag || event.pointerId !== state.drag.pointerId) return;
  state.drag = null;
  regenerate();
  renderAll();
}

function svgPoint(event) {
  const svg = $("#networkSvg");
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  return point.matrixTransform(svg.getScreenCTM().inverse());
}

function getSelectedStation() {
  return state.project.stations.find((station) => station.id === state.selectedStationId);
}

function getPreviewStation() {
  return state.project.stations.find((station) => station.id === state.previewStationId) || getSelectedStation() || state.project.stations[0];
}

function getEditorMode() {
  return state.project.settings.editorMode === "expert" ? "expert" : "simple";
}

function isExpertMode() {
  return getEditorMode() === "expert";
}

function select(field, ruleId, value, options, scope) {
  return `
    <select data-scope="${attr(scope)}" data-rule-id="${attr(ruleId)}" data-field="${attr(field)}">
      ${options.map(([id, label]) => `<option value="${attr(id)}" ${id === value ? "selected" : ""}>${html(label)}</option>`).join("")}
    </select>
  `;
}

async function copyActiveOutput() {
  const text = getActiveOutputText();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    flash("コピー済み");
  } catch {
    const textarea = $(".output-text");
    if (textarea) {
      textarea.select();
      document.execCommand("copy");
      flash("コピー済み");
    }
  }
}

function downloadActiveOutput() {
  const text = getActiveOutputText();
  const extension = state.activeOutput === "json" ? "json" : state.activeOutput === "csv" ? "csv" : "txt";
  const type = state.activeOutput === "json" ? "application/json" : state.activeOutput === "csv" ? "text/csv" : "text/plain";
  downloadText(`mtr-time-scheduler-${state.activeOutput}.${extension}`, text, type);
}

function downloadText(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function handleImport(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      state.project = normalizeProject(JSON.parse(String(reader.result)));
      state.selectedStationId = state.project.stations[0].id;
      regenerate();
      renderAll();
      flash("読み込み済み");
    } catch {
      flash("読み込み失敗");
    }
  });
  reader.readAsText(file);
  event.target.value = "";
}

function flash(message) {
  const target = $("#flash");
  target.textContent = message;
  target.classList.add("is-visible");
  window.setTimeout(() => target.classList.remove("is-visible"), 1400);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function html(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function attr(value) {
  return html(value);
}
