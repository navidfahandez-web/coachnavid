// Video analysis page: language switch, Ziina payment buttons and WhatsApp links.
import { applyStatic, setLang, t } from './i18n.js';
import { ANALYSIS, COACH } from './config.js';

const waNumber = (COACH.whatsapp || '').replace(/\D/g, '');
const wa = (text) => `https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`;

function render() {
  applyStatic();
  document.title = t('va.meta');

  document.querySelectorAll('[data-plan]').forEach((card) => {
    const plan = ANALYSIS[card.dataset.plan];
    if (!plan) return;
    card.querySelector('[data-price]').textContent = plan.price;
    const btn = card.querySelector('[data-buy]');
    const label = btn.querySelector('span');
    if (plan.link) {
      btn.href = plan.link;
      label.textContent = t('va.pay');
    } else {
      btn.href = wa(t('va.askText', { plan: plan.name }));
      label.textContent = t('va.ask');
    }
  });

  document.querySelectorAll('[data-send-wa]').forEach((a) => {
    a.href = wa(t('va.waText'));
    a.hidden = !waNumber;
  });
  const foot = document.querySelector('[data-coach-wa]');
  if (foot && waNumber) { foot.href = `https://wa.me/${waNumber}`; foot.hidden = false; }
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-lang]');
  if (!b) return;
  setLang(b.dataset.lang);
  render();
});

render();
