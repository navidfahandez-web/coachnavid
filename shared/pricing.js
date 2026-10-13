// Lesson prices and payment links per lesson length (minutes).
// Fill in `price` (shown to the student) and `url` (your payment link). Leave url empty to hide the line.
export const PAYMENT_LINKS = {
  60: { price: '', url: '' },
  90: { price: '', url: '' },
  120: { price: '', url: '' },
};

// Shown in confirmations, reminders, the booking form and the terms page.
export const CANCELLATION_HOURS = 12;

export const paymentFor = (duration) => {
  const p = PAYMENT_LINKS[duration];
  return p && p.url ? p : null;
};
