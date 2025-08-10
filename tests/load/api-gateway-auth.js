import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const loginErrorRate = new Rate('login_errors');
const loginDuration = new Trend('login_duration');
const registrationErrorRate = new Rate('registration_errors');
const authDuration = new Trend('auth_duration');

// Test configuration
export const options = {
  stages: [
    // Warm up
    { duration: '1m', target: 10 },
    // Ramp up
    { duration: '3m', target: 50 },
    // Stay at 50 users for 5 minutes
    { duration: '5m', target: 50 },
    // Ramp up to 100 users
    { duration: '2m', target: 100 },
    // Stay at 100 users for 5 minutes
    { duration: '5m', target: 100 },
    // Ramp down
    { duration: '2m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% of requests should be below 2s
    http_req_failed: ['rate<0.05'], // Error rate should be less than 5%
    login_errors: ['rate<0.02'], // Login error rate should be less than 2%
    login_duration: ['p(95)<1500'], // 95% of login requests should be below 1.5s
    registration_errors: ['rate<0.03'], // Registration error rate should be less than 3%
    auth_duration: ['p(95)<500'], // 95% of auth verification should be below 500ms
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Test data
const users = [
  { email: 'admin@example.com', password: 'admin123', name: 'Admin User' },
  { email: 'user@example.com', password: 'user123', name: 'Regular User' },
];

let userTokens = {};

export function setup() {
  console.log(`Starting load test against ${BASE_URL}`);

  // Health check
  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, {
    'health check status is 200': (r) => r.status === 200,
  });

  return { baseUrl: BASE_URL };
}

export default function (data) {
  const userId = __VU;
  const iteration = __ITER;

  // Determine test scenario based on iteration
  const scenario = iteration % 4;

  switch (scenario) {
    case 0:
      testLogin();
      break;
    case 1:
      testRegistration();
      break;
    case 2:
      testAuthVerification();
      break;
    case 3:
      testProtectedEndpoints();
      break;
  }

  sleep(1);
}

function testLogin() {
  const user = users[Math.floor(Math.random() * users.length)];
  const startTime = Date.now();

  const payload = {
    email: user.email,
    password: user.password,
  };

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const response = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify(payload),
    params
  );

  const duration = Date.now() - startTime;
  loginDuration.add(duration);

  const success = check(response, {
    'login status is 201': (r) => r.status === 201,
    'login response has token': (r) => {
      try {
        const json = JSON.parse(r.body);
        return json.access_token !== undefined;
      } catch (e) {
        return false;
      }
    },
    'login response time < 2s': (r) => r.timings.duration < 2000,
  });

  if (!success) {
    loginErrorRate.add(1);
  } else {
    loginErrorRate.add(0);
    // Store token for later use
    try {
      const json = JSON.parse(response.body);
      userTokens[__VU] = json.access_token;
    } catch (e) {
      console.error('Failed to parse login response:', e);
    }
  }
}

function testRegistration() {
  const timestamp = Date.now();
  const randomUser = {
    email: `testuser${__VU}${timestamp}@example.com`,
    password: 'testpassword123',
    name: `Test User ${__VU}`,
  };

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const response = http.post(
    `${BASE_URL}/auth/register`,
    JSON.stringify(randomUser),
    params
  );

  const success = check(response, {
    'registration status is 201 or 409': (r) =>
      r.status === 201 || r.status === 409, // 409 for existing user
    'registration response time < 3s': (r) => r.timings.duration < 3000,
  });

  if (!success && response.status !== 409) {
    registrationErrorRate.add(1);
  } else {
    registrationErrorRate.add(0);
  }
}

function testAuthVerification() {
  // First get a token
  const user = users[0];
  const loginPayload = {
    email: user.email,
    password: user.password,
  };

  const loginParams = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const loginResponse = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify(loginPayload),
    loginParams
  );

  if (loginResponse.status !== 201) {
    return;
  }

  let token;
  try {
    const json = JSON.parse(loginResponse.body);
    token = json.access_token;
  } catch (e) {
    return;
  }

  // Now verify the token
  const startTime = Date.now();
  const verifyPayload = { token };

  const response = http.post(
    `${BASE_URL}/auth/verify`,
    JSON.stringify(verifyPayload),
    loginParams
  );

  const duration = Date.now() - startTime;
  authDuration.add(duration);

  check(response, {
    'auth verification status is 200': (r) => r.status === 200,
    'auth verification response has user': (r) => {
      try {
        const json = JSON.parse(r.body);
        return json.email !== undefined;
      } catch (e) {
        return false;
      }
    },
    'auth verification response time < 1s': (r) => r.timings.duration < 1000,
  });
}

function testProtectedEndpoints() {
  let token = userTokens[__VU];

  // If no token, get one first
  if (!token) {
    const user = users[0];
    const loginPayload = {
      email: user.email,
      password: user.password,
    };

    const params = {
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const loginResponse = http.post(
      `${BASE_URL}/auth/login`,
      JSON.stringify(loginPayload),
      params
    );

    if (loginResponse.status === 201) {
      try {
        const json = JSON.parse(loginResponse.body);
        token = json.access_token;
        userTokens[__VU] = token;
      } catch (e) {
        return;
      }
    } else {
      return;
    }
  }

  const params = {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };

  // Test protected endpoints
  const endpoints = ['/users', '/health'];

  endpoints.forEach((endpoint) => {
    const response = http.get(`${BASE_URL}${endpoint}`, params);

    check(response, {
      [`${endpoint} status is 200`]: (r) => r.status === 200,
      [`${endpoint} response time < 1s`]: (r) => r.timings.duration < 1000,
    });
  });
}

export function handleSummary(data) {
  return {
    'load-test-results.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

function textSummary(data, options = {}) {
  const indent = options.indent || '';
  const colors = options.enableColors || false;

  let summary = `${indent}Load Test Results:\n`;
  summary += `${indent}==================\n\n`;

  // Test duration
  summary += `${indent}Test Duration: ${Math.round(
    data.state.testRunDurationMs / 1000
  )}s\n`;

  // VU statistics
  summary += `${indent}Virtual Users: ${data.metrics.vus.values.max}\n`;
  summary += `${indent}Iterations: ${data.metrics.iterations.values.count}\n\n`;

  // HTTP statistics
  summary += `${indent}HTTP Requests:\n`;
  summary += `${indent}  Total: ${data.metrics.http_reqs.values.count}\n`;
  summary += `${indent}  Rate: ${data.metrics.http_reqs.values.rate.toFixed(
    2
  )}/sec\n`;
  summary += `${indent}  Failed: ${(
    data.metrics.http_req_failed.values.rate * 100
  ).toFixed(2)}%\n\n`;

  // Response time statistics
  summary += `${indent}Response Times:\n`;
  summary += `${indent}  Average: ${data.metrics.http_req_duration.values.avg.toFixed(
    2
  )}ms\n`;
  summary += `${indent}  Median: ${data.metrics.http_req_duration.values.med.toFixed(
    2
  )}ms\n`;
  summary += `${indent}  95th percentile: ${data.metrics.http_req_duration.values[
    'p(95)'
  ].toFixed(2)}ms\n`;
  summary += `${indent}  Max: ${data.metrics.http_req_duration.values.max.toFixed(
    2
  )}ms\n\n`;

  // Custom metrics
  if (data.metrics.login_errors) {
    summary += `${indent}Login Error Rate: ${(
      data.metrics.login_errors.values.rate * 100
    ).toFixed(2)}%\n`;
  }

  if (data.metrics.registration_errors) {
    summary += `${indent}Registration Error Rate: ${(
      data.metrics.registration_errors.values.rate * 100
    ).toFixed(2)}%\n`;
  }

  return summary;
}
