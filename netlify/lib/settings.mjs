import { isValidDate } from '../../shared/rules.js';

// Days off, set in Netlify env as BLOCKED_DATES=2026-10-12,2026-10-13
export const blockedDates = () =>
  (process.env.BLOCKED_DATES ?? '').split(',').map((s) => s.trim()).filter(isValidDate);
