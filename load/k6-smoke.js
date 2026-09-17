import http from "k6/http";
import { check, sleep } from "k6";

// Smoke profile: a light, quick pass to prove the public read paths respond and
// meet baseline latency/error budgets before heavier profiles run in UAT.
const BASE_URL = __ENV.BASE_URL || "http://localhost:3001";

export const options = {
  vus: 5,
  duration: "30s",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500"],
  },
};

export default function smoke() {
  const live = http.get(`${BASE_URL}/health/live`);
  check(live, { "live 200": (r) => r.status === 200 });

  const cars = http.get(`${BASE_URL}/api/cars`);
  check(cars, { "cars 200": (r) => r.status === 200 });

  const dealers = http.get(`${BASE_URL}/api/dealers`);
  check(dealers, { "dealers 200": (r) => r.status === 200 });

  sleep(1);
}
