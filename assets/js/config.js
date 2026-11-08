// Public details shown on the page. Private settings (API tokens, the number
// that receives requests) live in Netlify environment variables instead.
export const COACH = {
  // Public WhatsApp for questions, e.g. '+370 612 34567'. Leave empty to hide the links.
  whatsapp: '+971 56 167 7227',
};

// Video analysis: paste your Ziina payment links here (one per plan).
// Leave a link empty and that plan's button becomes "Request on WhatsApp" instead.
export const ANALYSIS = {
  quick:    { name: 'Quick Fix',     price: 149, link: 'https://pay.ziina.com/thepadelbeast/XL4fTXTcn' },
  match:    { name: 'Match Report',  price: 349, link: 'https://pay.ziina.com/thepadelbeast/DO64tYVhRa' },
  progress: { name: 'Progress Plan', price: 599, link: 'https://pay.ziina.com/thepadelbeast/vr4O8tt8bH' },
};
