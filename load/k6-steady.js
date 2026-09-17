import http from "k6/http";
import { check, sleep } from "k6";

// Steady profile: models the design target of ~100 active users at ~50 RPS for
// a sustained window, mixing catalog reads that dominate portal traffic.
const BASE_URL = __ENV.BASE_URL || "http://localhost:3001";

export const options = {
  scenarios: {
    steady: {
      executor: "constant-arrival-rate",
      rate: 50,
      timeUnit: "1s",
      duration: "5m",
      preAllocatedVUs: 100,
      maxVUs: 150,
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500", "p(99)<1000"],
  },
};

const paths = ["/api/cars", "/api/dealers", "/api/content/home.hero"];

export default function steady() {
  const path = paths[Math.floor(Math.random() * paths.length)];
  const response = http.get(`${BASE_URL}${path}`);
  check(response, { "status < 500": (r) => r.status < 500 });
  sleep(Math.random());
}
