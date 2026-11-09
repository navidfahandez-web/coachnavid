// "My reports": WhatsApp code login → the player's private progress page.
const $ = (s) => document.querySelector(s);
const KEY = 'cn-player';
let saved = null;
try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* storage blocked */ }

async function post(path, body) {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

const phoneForm = $('[data-step=phone]');
const codeForm = $('[data-step=code]');
const showError = (form, msg) => { const e = form.querySelector('[data-error]'); e.textContent = msg; e.hidden = !msg; };

function showSaved() {
  $('[data-saved]').hidden = false;
  phoneForm.hidden = true;
  codeForm.hidden = true;
  $('[data-name]').textContent = saved.firstName;
  $('[data-open]').href = `/player/${saved.playerToken}`;
}

phoneForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  showError(phoneForm, '');
  const btn = phoneForm.querySelector('button');
  btn.disabled = true;
  try {
    await post('/api/me/code', { phone: phoneForm.elements.phone.value });
    phoneForm.hidden = true;
    codeForm.hidden = false;
    codeForm.elements.code.focus();
  } catch (err) { showError(phoneForm, err.message); }
  btn.disabled = false;
});

codeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  showError(codeForm, '');
  try {
    const r = await post('/api/me/verify', { phone: phoneForm.elements.phone.value, code: codeForm.elements.code.value });
    saved = { playerToken: r.playerToken, firstName: r.firstName };
    try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* fine — just won't be remembered */ }
    location.href = `/player/${r.playerToken}`;
  } catch (err) { showError(codeForm, err.message); }
});

$('[data-back]').addEventListener('click', () => { codeForm.hidden = true; phoneForm.hidden = false; });
$('[data-logout]').addEventListener('click', () => {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  saved = null;
  $('[data-saved]').hidden = true;
  phoneForm.hidden = false;
});

if (saved?.playerToken) showSaved();
