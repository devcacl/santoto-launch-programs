import http from 'k6/http';
import { check, sleep } from 'k6';

const base = __ENV.BASE_URL || 'http://host.docker.internal:3001';
const prefix = __ENV.LOAD_TEST_PREFIX || `load-${Date.now()}`;
const talkCodes = [__ENV.TALK_1_CODE, __ENV.TALK_2_CODE, __ENV.TALK_3_CODE];
const games = [
  ['nutrition', 'plate-builder', ['arroz', 'frijoles', 'tomate']],
  ['nutrition', 'market-basket', ['lentejas', 'maiz', 'manzana']],
  ['nutrition', 'safe-route', ['wash', 'prepare', 'cook', 'store']],
  ['nutrition', 'nutrient-match', { energy: 'grains', variety: 'produce', hydration: 'water', fiber: 'whole', context: 'family' }],
  ['nutrition', 'balanced-snack', { energy: 4, fresh: 4, protein: 4 }],
  ['business-intelligence', 'dashboard-detective', 'checkout'],
  ['business-intelligence', 'budget-allocation', { research: 3, pilot: 4, measure: 3 }],
  ['business-intelligence', 'evidence-headline', 'sales-up|returns-down'],
  ['business-intelligence', 'metric-match', { conversion: 'desired-action', abandonment: 'drop-off', retention: 'returning', basket: 'amount', service: 'speed' }],
  ['business-intelligence', 'insight-sequence', ['ask', 'collect', 'clean', 'analyze', 'communicate']],
];

export const options = {
  scenarios: { attendee_journey: { executor: 'per-vu-iterations', vus: Number(__ENV.VUS || 300), iterations: Number(__ENV.ITERATIONS_PER_VU || 1), maxDuration: __ENV.MAX_DURATION || '10m' } },
  thresholds: { http_req_failed: ['rate<0.001'], http_req_duration: ['p(95)<3000'], checks: ['rate>0.999'] },
};

function checked(response, message) {
  const passed = check(response, { [message]: (r) => r.status === 200 });
  if (!passed) console.error(`${message} failed: status=${response.status} body=${String(response.body).slice(0, 180)}`);
  return passed;
}

export default function () {
  // Spread QR scans over a brief, realistic arrival window while keeping 300 VUs active.
  sleep((__VU % 30) * 0.05);
  const email = `${prefix}-${__VU}-${__ITER}@example.test`;
  const params = { headers: { 'Content-Type': 'application/json' }, tags: { flow: 'attendee' } };
  const post = (path, body) => http.post(`${base}/api${path}`, JSON.stringify(body), params);
  let response = post('/auth/register', { firstName: 'Prueba', lastName: 'Carga', email, phone: '3001234567', school: 'Prueba de carga', city: 'Tunja', consentPrivacy: true, consentMarketing: false });
  if (!checked(response, 'registro creado')) return;
  for (const [program, challenge, answer] of games) {
    response = post(`/challenges/${program}/${challenge}/complete`, { answer });
    if (!checked(response, 'reto guardado')) return;
  }
  for (let index = 0; index < talkCodes.length; index++) {
    response = post(`/talks/talk-${index + 1}/check-in`, { code: talkCodes[index] });
    if (!checked(response, 'asistencia guardada')) return;
  }
  response = http.patch(`${base}/api/me/preference`, JSON.stringify({ program: 'Nutrición y Dietética' }), params);
  checked(response, 'preferencia guardada');
  sleep(0.1);
}
