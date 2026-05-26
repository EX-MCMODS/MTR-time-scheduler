const DAY_SECONDS = 24 * 60 * 60;

export function uid(prefix = "id") {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
}

export function timeToSeconds(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }

  const text = String(value || "00:00:00").trim();
  const parts = text.split(":").map((part) => Number(part));
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !Number.isFinite(part))) {
    return 0;
  }

  const [hours, minutes, seconds = 0] = parts;
  return Math.max(0, Math.round(hours * 3600 + minutes * 60 + seconds));
}

export function secondsToTime(totalSeconds) {
  const wrapped = ((Math.round(totalSeconds) % DAY_SECONDS) + DAY_SECONDS) % DAY_SECONDS;
  const hours = Math.floor(wrapped / 3600);
  const minutes = Math.floor((wrapped % 3600) / 60);
  const seconds = wrapped % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

export function secondsToDuration(totalSeconds) {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return [hours, minutes, secs].map((part) => String(part).padStart(2, "0")).join(":");
}

export function makeDefaultProject() {
  const services = [
    {
      id: "express",
      name: "特急",
      color: "#d83b32",
      priority: 1,
      active: true,
      maxSpeedKph: 130,
      firstDeparture: "07:00:00",
      lastDeparture: "09:00:00",
      headwayMinutes: 20,
      defaultDwellSeconds: 30
    },
    {
      id: "rapid",
      name: "快速",
      color: "#246bfe",
      priority: 2,
      active: true,
      maxSpeedKph: 105,
      firstDeparture: "07:05:00",
      lastDeparture: "09:05:00",
      headwayMinutes: 20,
      defaultDwellSeconds: 35
    },
    {
      id: "local",
      name: "各停",
      color: "#16855b",
      priority: 3,
      active: true,
      maxSpeedKph: 80,
      firstDeparture: "07:02:00",
      lastDeparture: "09:02:00",
      headwayMinutes: 10,
      defaultDwellSeconds: 45
    }
  ];

  const stopTemplate = (stops) => ({
    express: Boolean(stops.express),
    rapid: Boolean(stops.rapid),
    local: Boolean(stops.local)
  });

  const stationTemplate = (id, name, x, y, stops, platforms) => ({
    id,
    name,
    x,
    y,
    tracks: 4,
    defaultPlatform: "1",
    stopByService: stopTemplate(stops),
    dwellSecondsByService: {
      express: stops.express ? 30 : 0,
      rapid: stops.rapid ? 35 : 0,
      local: 45
    },
    platformByService: {
      express: platforms.express || "3",
      rapid: platforms.rapid || "2",
      local: platforms.local || "1"
    }
  });

  return {
    version: 1,
    name: "MTR Real Time Scheduler",
    settings: {
      routeName: "Sample Line",
      distanceUnit: "blocks",
      runTimePaddingSeconds: 15,
      minPlatformHeadwaySeconds: 75,
      firstLastAlwaysStop: true
    },
    services,
    stations: [
      stationTemplate("st-a", "A駅", 90, 220, { express: true, rapid: true, local: true }, { express: "3", rapid: "2", local: "1" }),
      stationTemplate("st-b", "B駅", 260, 160, { express: false, rapid: false, local: true }, { local: "1" }),
      stationTemplate("st-c", "C駅", 440, 220, { express: false, rapid: true, local: true }, { rapid: "2", local: "1" }),
      stationTemplate("st-d", "D駅", 620, 160, { express: false, rapid: false, local: true }, { local: "1" }),
      stationTemplate("st-e", "E駅", 800, 220, { express: true, rapid: true, local: true }, { express: "3", rapid: "2", local: "1" })
    ],
    segments: [
      { id: "seg-a-b", distanceM: 950, speedLimitKph: 95 },
      { id: "seg-b-c", distanceM: 1100, speedLimitKph: 95 },
      { id: "seg-c-d", distanceM: 1050, speedLimitKph: 100 },
      { id: "seg-d-e", distanceM: 1300, speedLimitKph: 110 }
    ],
    waitRules: [
      {
        id: "wait-local-express-c",
        active: true,
        stationId: "st-c",
        waitingServiceId: "local",
        passingServiceId: "express",
        lookAheadMinutes: 12,
        bufferSeconds: 60
      }
    ]
  };
}

export function normalizeProject(project) {
  const fallback = makeDefaultProject();
  const next = structuredCloneSafe(project || fallback);
  next.version = next.version || 1;
  next.name = next.name || fallback.name;
  next.settings = { ...fallback.settings, ...(next.settings || {}) };
  next.services = Array.isArray(next.services) && next.services.length ? next.services : fallback.services;
  next.stations = Array.isArray(next.stations) && next.stations.length >= 2 ? next.stations : fallback.stations;
  next.segments = Array.isArray(next.segments) ? next.segments : [];
  next.waitRules = Array.isArray(next.waitRules) ? next.waitRules : [];

  next.services = next.services.map((service, index) => ({
    id: service.id || uid("svc"),
    name: service.name || `等級${index + 1}`,
    color: service.color || ["#d83b32", "#246bfe", "#16855b", "#8a4bd2"][index % 4],
    priority: numberOr(service.priority, index + 1),
    active: service.active !== false,
    maxSpeedKph: numberOr(service.maxSpeedKph, 80),
    firstDeparture: service.firstDeparture || "07:00:00",
    lastDeparture: service.lastDeparture || "09:00:00",
    headwayMinutes: numberOr(service.headwayMinutes, 10),
    defaultDwellSeconds: numberOr(service.defaultDwellSeconds, 40)
  }));

  const serviceIds = new Set(next.services.map((service) => service.id));
  next.stations = next.stations.map((station, index) => {
    const normalized = {
      id: station.id || uid("st"),
      name: station.name || `駅${index + 1}`,
      x: numberOr(station.x, 100 + index * 160),
      y: numberOr(station.y, index % 2 ? 160 : 240),
      tracks: Math.max(1, numberOr(station.tracks, 2)),
      defaultPlatform: station.defaultPlatform || "1",
      stopByService: { ...(station.stopByService || {}) },
      dwellSecondsByService: { ...(station.dwellSecondsByService || {}) },
      platformByService: { ...(station.platformByService || {}) }
    };

    next.services.forEach((service) => {
      if (typeof normalized.stopByService[service.id] !== "boolean") {
        normalized.stopByService[service.id] = true;
      }
      if (!Number.isFinite(Number(normalized.dwellSecondsByService[service.id]))) {
        normalized.dwellSecondsByService[service.id] = service.defaultDwellSeconds;
      }
      if (!normalized.platformByService[service.id]) {
        normalized.platformByService[service.id] = normalized.defaultPlatform;
      }
    });

    Object.keys(normalized.stopByService).forEach((serviceId) => {
      if (!serviceIds.has(serviceId)) {
        delete normalized.stopByService[serviceId];
        delete normalized.dwellSecondsByService[serviceId];
        delete normalized.platformByService[serviceId];
      }
    });

    return normalized;
  });

  const neededSegments = Math.max(0, next.stations.length - 1);
  while (next.segments.length < neededSegments) {
    next.segments.push({ id: uid("seg"), distanceM: 1000, speedLimitKph: 90 });
  }
  next.segments = next.segments.slice(0, neededSegments).map((segment) => ({
    id: segment.id || uid("seg"),
    distanceM: Math.max(1, numberOr(segment.distanceM, 1000)),
    speedLimitKph: Math.max(5, numberOr(segment.speedLimitKph, 90))
  }));

  next.waitRules = next.waitRules
    .filter((rule) => next.stations.some((station) => station.id === rule.stationId))
    .filter((rule) => serviceIds.has(rule.waitingServiceId) && serviceIds.has(rule.passingServiceId))
    .map((rule) => ({
      id: rule.id || uid("wait"),
      active: rule.active !== false,
      stationId: rule.stationId,
      waitingServiceId: rule.waitingServiceId,
      passingServiceId: rule.passingServiceId,
      lookAheadMinutes: numberOr(rule.lookAheadMinutes, 10),
      bufferSeconds: numberOr(rule.bufferSeconds, 60)
    }));

  return next;
}

export function generateTimetable(projectInput) {
  const project = normalizeProject(projectInput);
  const warnings = [];
  const trips = [];
  const waitEvents = [];
  const conflictEvents = [];

  const services = [...project.services]
    .filter((service) => service.active)
    .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));

  services.forEach((service) => {
    const departures = getServiceDepartures(service);
    departures.forEach((departure, tripIndex) => {
      const trip = buildTrip(project, service, departure, tripIndex + 1, trips, warnings);
      trips.push(trip);
      waitEvents.push(...trip.waitEvents);
      conflictEvents.push(...trip.conflictEvents);
    });
  });

  trips.sort((a, b) => a.firstDeparture - b.firstDeparture || a.service.priority - b.service.priority);

  return {
    project,
    trips,
    waitEvents,
    conflictEvents,
    warnings,
    serviceSummaries: services.map((service) => {
      const departures = getServiceDepartures(service);
      return {
        serviceId: service.id,
        serviceName: service.name,
        color: service.color,
        firstDeparture: departures[0] ?? null,
        lastDeparture: departures.at(-1) ?? null,
        count: departures.length,
        headwaySeconds: Math.round(numberOr(service.headwayMinutes, 0) * 60),
        expression: departures.length
          ? `${secondsToTime(departures[0])}+${departures.length}*${secondsToDuration(numberOr(service.headwayMinutes, 0) * 60)}`
          : ""
      };
    })
  };
}

export function getServiceDepartures(service) {
  const headwaySeconds = Math.max(60, Math.round(numberOr(service.headwayMinutes, 10) * 60));
  const first = timeToSeconds(service.firstDeparture);
  let last = timeToSeconds(service.lastDeparture);
  if (last < first) {
    last += DAY_SECONDS;
  }

  const departures = [];
  for (let time = first; time <= last + 0.1; time += headwaySeconds) {
    departures.push(time);
    if (departures.length > 3000) break;
  }
  return departures;
}

export function generateCsv(generated) {
  const rows = [
    ["service", "trip", "station", "arrival", "departure", "platform", "stop", "wait", "conflictAdjust"]
  ];

  generated.trips.forEach((trip) => {
    trip.stopTimes.forEach((stopTime) => {
      rows.push([
        trip.service.name,
        trip.tripName,
        stopTime.stationName,
        secondsToTime(stopTime.arrival),
        secondsToTime(stopTime.departure),
        stopTime.platform,
        stopTime.stop ? "stop" : "pass",
        stopTime.waitReason || "",
        stopTime.conflictReason || ""
      ]);
    });
  });

  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

export function generateMtrRealtimeText(generated) {
  const lines = [];
  lines.push(`# ${generated.project.settings.routeName}`);
  lines.push("# MTR Real Time schedule input");
  lines.push("# Depot schedule screen accepts individual HH:MM:SS entries and repeated expressions such as HH:MM:SS+count*HH:MM:SS.");
  lines.push("");

  generated.serviceSummaries.forEach((summary) => {
    if (!summary.count) return;
    const departures = generated.trips
      .filter((trip) => trip.service.id === summary.serviceId)
      .map((trip) => secondsToTime(trip.firstDeparture));

    lines.push(`[${summary.serviceName}]`);
    lines.push(`expression=${summary.expression}`);
    lines.push(`departures=${departures.join(", ")}`);
    lines.push("");
  });

  if (generated.waitEvents.length) {
    lines.push("# Overtake waits applied after depot departure; copy depot expressions first, then use this table to verify station times.");
    generated.waitEvents.forEach((event) => {
      lines.push(`${event.waitingTrip} waits at ${event.stationName} until ${secondsToTime(event.newDeparture)} for ${event.passingTrip}`);
    });
  }

  return lines.join("\n");
}

export function generatePlanJson(generated) {
  return JSON.stringify(
    {
      format: "mtr-time-scheduler-plan",
      version: 1,
      routeName: generated.project.settings.routeName,
      realtimeSchedules: generated.serviceSummaries.map((summary) => ({
        serviceId: summary.serviceId,
        serviceName: summary.serviceName,
        expression: summary.expression,
        departures: generated.trips
          .filter((trip) => trip.service.id === summary.serviceId)
          .map((trip) => secondsToTime(trip.firstDeparture))
      })),
      timetable: generated.trips.map((trip) => ({
        serviceId: trip.service.id,
        serviceName: trip.service.name,
        tripName: trip.tripName,
        stopTimes: trip.stopTimes.map((stopTime) => ({
          stationId: stopTime.stationId,
          stationName: stopTime.stationName,
          arrival: secondsToTime(stopTime.arrival),
          departure: secondsToTime(stopTime.departure),
          platform: stopTime.platform,
          stop: stopTime.stop,
          waitReason: stopTime.waitReason || "",
          conflictReason: stopTime.conflictReason || ""
        }))
      })),
      waitEvents: generated.waitEvents,
      conflictEvents: generated.conflictEvents,
      warnings: generated.warnings
    },
    null,
    2
  );
}

function buildTrip(project, service, firstDeparture, tripNumber, previousTrips, warnings) {
  const stopTimes = [];
  const waitEvents = [];
  const conflictEvents = [];
  let currentDeparture = firstDeparture;

  project.stations.forEach((station, stationIndex) => {
    const terminal = stationIndex === 0 || stationIndex === project.stations.length - 1;
    let arrival = currentDeparture;

    if (stationIndex > 0) {
      const segment = project.segments[stationIndex - 1];
      arrival = currentDeparture + getRunSeconds(segment, service, project.settings.runTimePaddingSeconds);
    }

    const stop = shouldStop(project, station, service, terminal);
    let departure = stationIndex === 0 ? firstDeparture : arrival + (stop ? getDwellSeconds(station, service) : 0);
    const platform = getPlatform(station, service);
    let waitReason = "";
    let conflictReason = "";

    const waitRule = findWaitRule(project, station.id, service.id);
    if (waitRule && !stop) {
      warnings.push(`${service.name} ${station.name}: 待避設定がありますが停車しない設定です`);
    }

    if (waitRule && stop && stationIndex > 0) {
      const candidate = findPassingCandidate(previousTrips, waitRule, station.id, arrival, departure);
      if (candidate) {
        const oldDeparture = departure;
        departure = Math.max(departure, candidate.departure + waitRule.bufferSeconds);
        if (departure > oldDeparture) {
          waitReason = `${candidate.tripName} ${secondsToTime(candidate.departure)} 発通過待ち`;
          const event = {
            ruleId: waitRule.id,
            stationId: station.id,
            stationName: station.name,
            waitingTrip: "",
            passingTrip: candidate.tripName,
            oldDeparture,
            newDeparture: departure,
            addedSeconds: departure - oldDeparture
          };
          waitEvents.push(event);
        }
      }
    }

    if (stop && stationIndex > 0) {
      const conflict = findPlatformConflict(previousTrips, station.id, platform, arrival, departure, project.settings.minPlatformHeadwaySeconds);
      if (conflict) {
        const oldDeparture = departure;
        departure = Math.max(departure, conflict.releaseTime);
        if (departure > oldDeparture) {
          conflictReason = `${conflict.tripName} と番線間隔調整`;
          conflictEvents.push({
            stationId: station.id,
            stationName: station.name,
            platform,
            waitingTrip: "",
            blockingTrip: conflict.tripName,
            oldDeparture,
            newDeparture: departure,
            addedSeconds: departure - oldDeparture
          });
        }
      }
    }

    const stopTime = {
      stationId: station.id,
      stationName: station.name,
      arrival,
      departure,
      platform,
      stop,
      waitReason,
      conflictReason
    };

    stopTimes.push(stopTime);
    currentDeparture = departure;
  });

  const tripName = `${service.name}-${String(tripNumber).padStart(3, "0")}`;
  waitEvents.forEach((event) => {
    event.waitingTrip = tripName;
  });
  conflictEvents.forEach((event) => {
    event.waitingTrip = tripName;
  });

  return {
    id: uid("trip"),
    tripName,
    service: structuredCloneSafe(service),
    firstDeparture,
    lastArrival: stopTimes.at(-1)?.arrival ?? firstDeparture,
    stopTimes,
    waitEvents,
    conflictEvents
  };
}

function shouldStop(project, station, service, terminal) {
  if (terminal && project.settings.firstLastAlwaysStop) return true;
  return station.stopByService?.[service.id] !== false;
}

function getDwellSeconds(station, service) {
  return Math.max(0, Math.round(numberOr(station.dwellSecondsByService?.[service.id], service.defaultDwellSeconds)));
}

function getPlatform(station, service) {
  return String(station.platformByService?.[service.id] || station.defaultPlatform || "1");
}

function getRunSeconds(segment, service, paddingSeconds) {
  const speedKph = Math.max(5, Math.min(numberOr(service.maxSpeedKph, 80), numberOr(segment.speedLimitKph, 90)));
  const metersPerSecond = (speedKph * 1000) / 3600;
  return Math.max(1, Math.ceil(numberOr(segment.distanceM, 1000) / metersPerSecond + numberOr(paddingSeconds, 0)));
}

function findWaitRule(project, stationId, waitingServiceId) {
  return project.waitRules.find((rule) => rule.active && rule.stationId === stationId && rule.waitingServiceId === waitingServiceId);
}

function findPassingCandidate(previousTrips, rule, stationId, arrival, departure) {
  const lookAheadSeconds = Math.max(0, numberOr(rule.lookAheadMinutes, 0) * 60);
  return previousTrips
    .filter((trip) => trip.service.id === rule.passingServiceId)
    .map((trip) => {
      const stopTime = trip.stopTimes.find((item) => item.stationId === stationId);
      return stopTime ? { ...stopTime, tripName: trip.tripName } : null;
    })
    .filter(Boolean)
    .filter((candidate) => candidate.departure >= arrival && candidate.departure <= departure + lookAheadSeconds)
    .sort((a, b) => a.departure - b.departure)[0];
}

function findPlatformConflict(previousTrips, stationId, platform, arrival, departure, minHeadwaySeconds) {
  const minGap = Math.max(0, numberOr(minHeadwaySeconds, 0));
  return previousTrips
    .flatMap((trip) =>
      trip.stopTimes
        .filter((stopTime) => stopTime.stop && stopTime.stationId === stationId && stopTime.platform === platform)
        .map((stopTime) => ({ ...stopTime, tripName: trip.tripName }))
    )
    .filter((event) => event.departure >= arrival - minGap && event.departure <= departure + minGap)
    .map((event) => ({ ...event, releaseTime: event.departure + minGap }))
    .sort((a, b) => b.releaseTime - a.releaseTime)[0];
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function numberOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function structuredCloneSafe(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}
