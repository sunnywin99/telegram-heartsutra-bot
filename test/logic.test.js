import { test } from "node:test";
import assert from "node:assert/strict";
import { currentTotal, parseCommand, recordedText, recordingStats, taipeiNow } from "../src/logic.js";

test("解析指令", () => {
  assert.deepEqual(parseCommand("/help"), { kind: "help" });
  assert.deepEqual(parseCommand("總計"), { kind: "total" });
  assert.deepEqual(parseCommand("/total"), { kind: "total" });
  assert.deepEqual(parseCommand(" 108 "), { kind: "record", count: 108 });
  assert.deepEqual(parseCommand("１０８"), { kind: "record", count: 108 });
  assert.deepEqual(parseCommand("0"), { kind: "bad" });
  assert.deepEqual(parseCommand("-5"), { kind: "bad" });
  assert.deepEqual(parseCommand("10.5"), { kind: "bad" });
  assert.deepEqual(parseCommand("念了 10"), { kind: "bad" });
});

test("台北時間格式", () => {
  const ms = Date.parse("2026-10-25T23:30:05Z"); // 台北 10/26 07:30:05
  assert.deepEqual(taipeiNow(ms), { dateTime: "2026/10/26 07:30:05", date: "2026/10/26" });
});

test("累計與今日累計", () => {
  const rows = [
    ["2026/09/01 06:00:00", "108", "108"],
    ["2026/10/25 21:00:00", "21", "129"],
    ["2026/10/26 06:00:00", "7", "136"],
    ["2026/10/26 07:00:00", "3", "1,139"],
  ];
  assert.deepEqual(recordingStats(rows, "2026/10/26"), { firstDate: "2026/09/01", grandTotal: 1139, todayTotal: 10 });
  assert.deepEqual(recordingStats([], "2026/10/26"), { firstDate: "2026/10/26", grandTotal: 0, todayTotal: 0 });
  assert.equal(currentTotal([["108"], ["129"]]), 129);
  assert.equal(currentTotal([]), 0);
  assert.equal(recordedText(3, 10, 1139, "2026/09/01"), "已記錄：+3 (10) , 1139 (from 2026/09/01)");
});
