import http from "k6/http";
import { check } from "k6";

// Spike profile: ramps to a 100 RPS peak and a 200-VU concurrent burst to check
// the system degrades gracefully (no 5xx storms) under sudden load, per the
// deployment design's resilience targets.
const BASE_URL = __ENV.BASE_URL || "http://localhost:3001";

export const options = {
  scenarios: {
    peak_rate: {
      executor: "ramping-arrival-rate",
      startRate: 10,
      timeUnit: "1s",
      preAllocatedVUs: 100,
      maxVUs: 250,
      stages: [
        { target: 100, duration: "1m" },
        { target: 100, duration: "2m" },
        { target: 0, duration: "30s" },
      ],
    },
    concurrent_spike: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { target: 200, duration: "30s" },
        { target: 200, duration: "1m" },
        { target: 0, duration: "30s" },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.02"],
    http_req_duration: ["p(95)<800"],
  },
};

export default function spike() {
  const response = http.get(`${BASE_URL}/api/cars`);
  check(response, { "status < 500": (r) => r.status < 500 });
}
