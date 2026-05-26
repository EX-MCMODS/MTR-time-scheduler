import assert from "node:assert/strict";
import test from "node:test";
import {
  generateMtrRealtimeText,
  generateTimetable,
  makeDefaultProject,
  secondsToTime,
  timeToSeconds
} from "../src/scheduler.js";

test("parses and formats clock times", () => {
  assert.equal(timeToSeconds("07:05:09"), 25509);
  assert.equal(secondsToTime(25509), "07:05:09");
  assert.equal(secondsToTime(24 * 3600 + 61), "00:01:01");
});

test("generates repeated MTR real-time expressions", () => {
  const project = makeDefaultProject();
  project.services = [project.services[0]];
  project.services[0].firstDeparture = "08:00:00";
  project.services[0].lastDeparture = "08:40:00";
  project.services[0].headwayMinutes = 20;

  const generated = generateTimetable(project);
  const text = generateMtrRealtimeText(generated);

  assert.match(text, /expression=08:00:00\+3\*00:20:00/);
});

test("applies overtake wait rules to lower priority services", () => {
  const project = makeDefaultProject();
  project.services = [
    {
      id: "express",
      name: "Express",
      color: "#d83b32",
      priority: 1,
      active: true,
      maxSpeedKph: 120,
      firstDeparture: "07:02:00",
      lastDeparture: "07:02:00",
      headwayMinutes: 20,
      defaultDwellSeconds: 20
    },
    {
      id: "local",
      name: "Local",
      color: "#16855b",
      priority: 2,
      active: true,
      maxSpeedKph: 70,
      firstDeparture: "07:00:00",
      lastDeparture: "07:00:00",
      headwayMinutes: 20,
      defaultDwellSeconds: 30
    }
  ];
  project.stations.forEach((station, index) => {
    station.stopByService = { express: index === 0 || index === 2 || index === project.stations.length - 1, local: true };
    station.dwellSecondsByService = { express: 20, local: 30 };
    station.platformByService = { express: "2", local: "1" };
  });
  project.waitRules = [
    {
      id: "wait",
      active: true,
      stationId: project.stations[2].id,
      waitingServiceId: "local",
      passingServiceId: "express",
      lookAheadMinutes: 12,
      bufferSeconds: 60
    }
  ];

  const generated = generateTimetable(project);
  const wait = generated.waitEvents[0];
  assert.ok(wait, "expected a wait event");
  assert.equal(wait.stationId, project.stations[2].id);
  assert.ok(wait.newDeparture > wait.oldDeparture);
});
