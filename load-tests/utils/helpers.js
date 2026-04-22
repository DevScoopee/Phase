import { check } from 'k6';

export const BASE_URL = __ENV.BASE_URL || 'https://api.subtrackr.example.com';

export const commonHeaders = {
  'Content-Type': 'application/json',
  'api-key': __ENV.API_KEY || 'default-test-key',
};

export function randomString(length) {
  const charset = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let res = '';
  while (length--) res += charset[(Math.random() * charset.length) | 0];
  return res;
}

export function handleResponse(res, status = 200) {
  const success = check(res, {
    [`status is ${status}`]: (r) => r.status === status,
    'transaction time < 500ms': (r) => r.timings.duration < 500,
  });
  return success;
}

export function generateSubscriptionData() {
  return JSON.stringify({
    name: `Test Sub ${randomString(5)}`,
    amount: Math.floor(Math.random() * 100) + 1,
    currency: 'USD',
    billingCycle: 'monthly',
  });
}
