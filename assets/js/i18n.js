// English / Lithuanian text for the booking page.
// Static text: elements with data-i18n (text), data-i18n-html (trusted markup from
// this file), data-i18n-aria / data-i18n-alt (attributes). Dynamic text: t('key').

const STRINGS = {
  en: {
    'meta.title': 'Padel Lessons with Coach Navid · Abu Dhabi',
    'nav.coach': 'Coach',
    'nav.where': 'Club',
    'nav.soon': 'Coming soon',
    'nav.how': 'How it works',
    'nav.book': 'Book a lesson',
    'lockup.role': 'Technical Director · Padel Beast',
    'lockup.aria': 'Coach Navid Fahandezh, Technical Director of Padel Beast — home',

    'hero.kicker': 'Coach Navid Fahandezh · Technical Director, Padel Beast',
    'hero.year': 'abu dhabi · 2026',
    'hero.title': 'padel<br />lessons',
    'hero.lede': 'Private padel lessons at <strong>The Padel Project</strong> in Musaffah, Abu Dhabi, with a World Padel Tour competitor and coach of 10+ years. Weekdays {wd}, weekends {we} — pick a time and Navid confirms on WhatsApp.',
    'hero.cta': 'See availability',
    'hero.about': 'About Navid',
    'hero.alt': 'Coach Navid Fahandezh on court',
    'hero.tag': 'On court at The Padel Project · Abu Dhabi',

    'stats.aria': 'Experience highlights',
    'stats.years': 'years of competitive padel',
    'stats.coaching': 'years coaching',
    'stats.wpt': 'World Padel Tour competitor, 2023',
    'stats.oman': 'Oman',
    'stats.omanText': 'national team coach',

    'book.kicker': 'pick a day,<br />then pick your time',
    'book.prev': 'Previous month',
    'book.next': 'Next month',
    'book.nextFree': 'Next free days',
    'legend.open': 'Open for lessons',
    'legend.full': 'Fully booked',
    'legend.pick': 'Your pick',

    'coach.kicker': 'the coach',
    'coach.title': 'train with someone<br />who has built the game.',
    'coach.p1': 'Navid has played padel competitively for over twenty years, including a run at <strong>World Padel Tour</strong> qualifier level in Spain in 2023, and has coached for more than a decade. He has coached the <strong>Oman</strong> national team, and teaches padel business and coaching internationally as a PadelMBA instructor.',
    'coach.p2': 'He is also the <strong>Technical Director of Padel Beast</strong> — the community-first club management company behind The Padel Project, Abu Dhabi’s highest-occupancy padel facility. Lessons are built around your game: technique, tactics, positioning and match play.',
    'coach.quote': '“We don’t just fill courts. We build communities.”',
    'coach.h1': '20+ years of competitive playing, 10+ years coaching',
    'coach.h2': 'World Padel Tour competitor (2023), qualifier level in Spain',
    'coach.h3': 'National team coach in Oman',
    'coach.h4': 'Built The Padel Project into Abu Dhabi’s highest-occupancy padel club',
    'coach.h5': 'PadelMBA instructor — padel business & coaching',

    'where.kicker': 'where we play',
    'where.title': 'the padel project,<br />musaffah.',
    'where.city': 'musaffah · abu dhabi',
    'where.text': 'Abu Dhabi’s highest-occupancy padel club, run by Padel Beast. All lessons take place on our courts in Musaffah.',
    'where.map': 'Open in Google Maps ↗',
    'where.hoursCity': 'lesson hours',
    'where.hoursTitle': 'Every day',
    'where.weekdays': 'Monday – Friday',
    'where.weekends': 'Saturday & Sunday',

    'soon.kicker': 'coming soon',
    'soon.title': 'next stops<br />on tour.',
    'soon.ltCity': 'lithuania · klaipėda & palanga',
    'soon.ltTitle': 'Back for Christmas',
    'soon.ltText': 'Navid will be back in Klaipėda and Palanga over the Christmas holidays. Dates will open here soon — message him to get on the list.',
    'soon.omCity': 'oman',
    'soon.omTitle': 'Padel Addicts',
    'soon.omText': 'Lessons at Padel Addicts in Oman are coming soon. Stay tuned.',
    'soon.cta': 'Get on the list on WhatsApp ↗',
    'soon.waText': 'Hi Navid! Please let me know when you’re coaching in Lithuania or Oman.',

    'how.kicker': 'how it works',
    'how.t1': 'Pick a day',
    'how.p1': 'Open days are bright on the calendar. Faded days are full or unavailable.',
    'how.t2': 'Choose length & time',
    'how.p2': '1h, 1h 30 or 2h — weekdays {wd}, weekends {we}.',
    'how.t3': 'Navid confirms',
    'how.p3': 'Your request goes straight to Navid. Once he says yes, the slot is yours and you get a WhatsApp confirmation.',

    'thanks.title': 'Ačiū labai!',
    'thanks.text': 'The lesson will be confirmed as soon as possible!',
    'foot.text': 'Padel lessons at The Padel Project, Musaffah · Coach Navid Fahandezh · Technical Director, <a href="https://thepadelbeast.com" target="_blank" rel="noopener">Padel Beast</a>',
    'foot.privacy': 'Privacy',

    // dynamic
    'cal.full': 'fully booked',
    'cal.open': 'open for lessons',
    'cal.closed': 'not available',
    'pill.full': 'full',
    'panel.loading': 'Loading availability…',
    'panel.pickDay': 'Choose a day on the calendar<br />to see Navid’s open times.',
    'panel.between': 'lessons {open}–{close}',
    'panel.length': 'lesson length',
    'panel.steps': '30-min steps',
    'panel.start': 'start time',
    'panel.striped': 'striped = booked',
    'panel.taken': 'Already booked',
    'panel.tooSoon': 'Too soon to book',
    'panel.noSlot': 'No {dur} slot left this day — try a shorter lesson or another day.',
    'panel.details': 'your details',
    'panel.sentTo': 'sent to Navid',
    'form.first': 'First name',
    'form.last': 'Last name',
    'form.phone': 'Phone (WhatsApp)',
    'form.pickStart': 'Pick a start time above',
    'form.sending': 'Sending…',
    'form.pickTime': 'Pick a start time',
    'form.submit': 'Request this lesson',
    'form.fine': 'Navid gets your request and confirms it — you’ll receive the confirmation on WhatsApp. The slot is held for you while he replies.',
    'err.name': 'Please enter your first and last name.',
    'err.phone': 'Please enter your WhatsApp number with country code, e.g. +971 50 123 4567.',
    'err.taken': 'Sorry — that time was just taken. Please pick another slot.',
    'err.too-soon': 'Lessons need to be requested at least 2 hours in advance.',
    'err.day-off': 'Navid is not available that day.',
    'err.generic': 'Something went wrong — please try again.',
    'err.justTaken': 'That time was just booked by someone else — please pick another.',
    'note.demo': 'Demo mode — the booking backend isn’t connected here, so nothing is sent to WhatsApp.',
    'note.loadError': 'Couldn’t load availability. Please refresh, or message Navid on WhatsApp.',
    'status.pending': 'request sent',
    'status.pendingText': 'Navid has your request. This page updates by itself as soon as he confirms — you can also come back later.',
    'status.confirmed': 'you’re booked!',
    'status.confirmedText': 'Navid confirmed your lesson — you’ll also get the confirmation on WhatsApp. See you on court!',
    'status.declined': 'not available',
    'status.declinedText': 'Navid can’t make this one. Please pick another time — or message him to find a slot that works.',
    'status.cancelled': 'lesson cancelled',
    'status.cancelledText': 'This lesson was cancelled and the slot is free again. Feel free to book another time.',
    'status.expired': 'no answer yet',
    'status.expiredText': 'Navid didn’t get to your request in time, so the slot was released. Please request again.',
    'status.ref': 'Reference {code}',
    'status.message': 'Message Navid on WhatsApp ↗',
    'status.waText': 'Hi Navid, about my lesson request {code}',
    'status.another': 'Book another lesson',
    'status.new': 'Start a new request',
    'status.pickAnother': 'Pick another time',
  },

  lt: {
    'meta.title': 'Padelio pamokos su treneriu Navid · Abu Dabis',
    'nav.coach': 'Treneris',
    'nav.where': 'Klubas',
    'nav.soon': 'Jau greitai',
    'nav.how': 'Kaip tai veikia',
    'nav.book': 'Rezervuoti pamoką',
    'lockup.role': 'Techninis direktorius · Padel Beast',
    'lockup.aria': 'Treneris Navid Fahandezh, Padel Beast techninis direktorius – pradžia',

    'hero.kicker': 'Treneris Navid Fahandezh · Padel Beast techninis direktorius',
    'hero.year': 'abu dabis · 2026',
    'hero.title': 'padelio<br />pamokos',
    'hero.lede': 'Privačios padelio pamokos <strong>The Padel Project</strong> klube Musafoje, Abu Dabyje, su World Padel Tour žaidėju ir daugiau nei 10 metų patirtį turinčiu treneriu. Darbo dienomis {wd}, savaitgaliais {we} – pasirinkite laiką, o Navid patvirtins per WhatsApp.',
    'hero.cta': 'Peržiūrėti laisvus laikus',
    'hero.about': 'Apie Navid',
    'hero.alt': 'Treneris Navid Fahandezh aikštelėje',
    'hero.tag': 'Aikštelėje – The Padel Project, Abu Dabis',

    'stats.aria': 'Patirtis',
    'stats.years': 'metų varžybinio padelio',
    'stats.coaching': 'metų trenerio darbo',
    'stats.wpt': 'World Padel Tour dalyvis, 2023',
    'stats.oman': 'Omanas',
    'stats.omanText': 'nacionalinės rinktinės treneris',

    'book.kicker': 'pasirinkite dieną,<br />tada – laiką',
    'book.prev': 'Ankstesnis mėnuo',
    'book.next': 'Kitas mėnuo',
    'book.nextFree': 'Artimiausios laisvos dienos',
    'legend.open': 'Laisva pamokoms',
    'legend.full': 'Viskas užimta',
    'legend.pick': 'Jūsų pasirinkimas',

    'coach.kicker': 'treneris',
    'coach.title': 'treniruokitės su tuo,<br />kuris kuria šį žaidimą.',
    'coach.p1': 'Navid varžybiniu padeliu žaidžia daugiau nei dvidešimt metų – 2023 m. jis dalyvavo <strong>World Padel Tour</strong> atrankose Ispanijoje – ir treniruoja daugiau nei dešimtmetį. Jis treniravo <strong>Omano</strong> nacionalinę rinktinę, o kaip PadelMBA instruktorius tarptautiniu mastu moko padelio verslo ir trenerio darbo.',
    'coach.p2': 'Jis taip pat yra <strong>Padel Beast techninis direktorius</strong> – bendruomenę kuriančios klubų valdymo įmonės, kuri valdo The Padel Project, labiausiai užimtą padelio kompleksą Abu Dabyje. Pamokos pritaikomos jūsų žaidimui: technika, taktika, pozicionavimas ir žaidimas varžybose.',
    'coach.quote': '„Mes ne tik užpildome aikšteles. Mes kuriame bendruomenes.“',
    'coach.h1': '20+ metų varžybinio žaidimo, 10+ metų trenerio darbo',
    'coach.h2': 'World Padel Tour dalyvis (2023), atrankos lygis Ispanijoje',
    'coach.h3': 'Omano nacionalinės rinktinės treneris',
    'coach.h4': 'The Padel Project pavertė labiausiai užimtu padelio klubu Abu Dabyje',
    'coach.h5': 'PadelMBA instruktorius – padelio verslas ir trenerio darbas',

    'where.kicker': 'kur žaidžiame',
    'where.title': 'the padel project,<br />musafa.',
    'where.city': 'musafa · abu dabis',
    'where.text': 'Labiausiai užimtas padelio klubas Abu Dabyje, valdomas Padel Beast. Visos pamokos vyksta mūsų aikštelėse Musafoje.',
    'where.map': 'Atidaryti „Google Maps“ ↗',
    'where.hoursCity': 'pamokų laikas',
    'where.hoursTitle': 'Kiekvieną dieną',
    'where.weekdays': 'Pirmadienis – penktadienis',
    'where.weekends': 'Šeštadienis ir sekmadienis',

    'soon.kicker': 'jau greitai',
    'soon.title': 'kitos<br />stotelės.',
    'soon.ltCity': 'lietuva · klaipėda ir palanga',
    'soon.ltTitle': 'Grįžtu per Kalėdas',
    'soon.ltText': 'Per Kalėdų atostogas Navid vėl bus Klaipėdoje ir Palangoje. Datos čia atsiras netrukus – parašykite jam, kad būtumėte sąraše.',
    'soon.omCity': 'omanas',
    'soon.omTitle': 'Padel Addicts',
    'soon.omText': 'Netrukus – pamokos Padel Addicts klube Omane. Sekite naujienas.',
    'soon.cta': 'Užsirašyti per WhatsApp ↗',
    'soon.waText': 'Sveiki, Navid! Praneškite, kai treniruosite Lietuvoje ar Omane.',

    'how.kicker': 'kaip tai veikia',
    'how.t1': 'Pasirinkite dieną',
    'how.p1': 'Laisvos dienos kalendoriuje ryškios. Išblukusios – užimtos arba neprieinamos.',
    'how.t2': 'Pasirinkite trukmę ir laiką',
    'how.p2': '1 val., 1 val. 30 min arba 2 val. – darbo dienomis {wd}, savaitgaliais {we}.',
    'how.t3': 'Navid patvirtina',
    'how.p3': 'Jūsų užklausa iškart pasiekia Navid. Kai jis patvirtina, laikas jūsų, o patvirtinimą gausite per WhatsApp.',

    'thanks.title': 'Ačiū labai!',
    'thanks.text': 'Pamoka bus patvirtinta kuo greičiau!',
    'foot.text': 'Padelio pamokos The Padel Project, Musafa · Treneris Navid Fahandezh · <a href="https://thepadelbeast.com" target="_blank" rel="noopener">Padel Beast</a> techninis direktorius',
    'foot.privacy': 'Privatumas',

    'cal.full': 'viskas užimta',
    'cal.open': 'laisva pamokoms',
    'cal.closed': 'neprieinama',
    'pill.full': 'užimta',
    'panel.loading': 'Įkeliami laisvi laikai…',
    'panel.pickDay': 'Pasirinkite dieną kalendoriuje,<br />kad pamatytumėte laisvus laikus.',
    'panel.between': 'pamokos {open}–{close}',
    'panel.length': 'pamokos trukmė',
    'panel.steps': 'kas 30 min.',
    'panel.start': 'pradžios laikas',
    'panel.striped': 'brūkšniuota – užimta',
    'panel.taken': 'Jau užimta',
    'panel.tooSoon': 'Per vėlu rezervuoti',
    'panel.noSlot': 'Šią dieną {dur} pamokai laiko neliko – rinkitės trumpesnę pamoką arba kitą dieną.',
    'panel.details': 'jūsų duomenys',
    'panel.sentTo': 'bus išsiųsta Navid',
    'form.first': 'Vardas',
    'form.last': 'Pavardė',
    'form.phone': 'Telefonas (WhatsApp)',
    'form.pickStart': 'Aukščiau pasirinkite pradžios laiką',
    'form.sending': 'Siunčiama…',
    'form.pickTime': 'Pasirinkite laiką',
    'form.submit': 'Rezervuoti šią pamoką',
    'form.fine': 'Navid gaus jūsų užklausą ir ją patvirtins – patvirtinimą gausite per WhatsApp. Kol jis atsakys, laikas jums rezervuotas.',
    'err.name': 'Įveskite vardą ir pavardę.',
    'err.phone': 'Įveskite WhatsApp numerį su šalies kodu, pvz., +370 612 34567.',
    'err.taken': 'Atsiprašome – šis laikas ką tik buvo užimtas. Pasirinkite kitą.',
    'err.too-soon': 'Pamoką reikia rezervuoti bent prieš 2 valandas.',
    'err.day-off': 'Tą dieną Navid neturi laisvo laiko.',
    'err.generic': 'Kažkas nepavyko – bandykite dar kartą.',
    'err.justTaken': 'Šį laiką ką tik užėmė kažkas kitas – pasirinkite kitą.',
    'note.demo': 'Demonstracinis režimas – rezervacijų sistema čia neprijungta, todėl niekas nesiunčiama per WhatsApp.',
    'note.loadError': 'Nepavyko įkelti laisvų laikų. Atnaujinkite puslapį arba parašykite Navid per WhatsApp.',
    'status.pending': 'užklausa išsiųsta',
    'status.pendingText': 'Navid gavo jūsų užklausą. Šis puslapis atsinaujins, kai tik jis patvirtins – galite sugrįžti ir vėliau.',
    'status.confirmed': 'pamoka rezervuota!',
    'status.confirmedText': 'Navid patvirtino jūsų pamoką – patvirtinimą gausite ir per WhatsApp. Iki pasimatymo aikštelėje!',
    'status.declined': 'laikas neprieinamas',
    'status.declinedText': 'Navid šiuo laiku negali. Pasirinkite kitą laiką arba parašykite jam ir susitarkite.',
    'status.cancelled': 'pamoka atšaukta',
    'status.cancelledText': 'Ši pamoka atšaukta, laikas vėl laisvas. Galite rezervuoti kitą laiką.',
    'status.expired': 'atsakymo negauta',
    'status.expiredText': 'Navid nespėjo atsakyti, todėl laikas buvo atlaisvintas. Pateikite užklausą dar kartą.',
    'status.ref': 'Užklausos nr. {code}',
    'status.message': 'Parašyti Navid per WhatsApp ↗',
    'status.waText': 'Sveiki, Navid, dėl mano pamokos užklausos {code}',
    'status.another': 'Rezervuoti kitą pamoką',
    'status.new': 'Nauja užklausa',
    'status.pickAnother': 'Pasirinkti kitą laiką',
  },
};

export const LANGS = Object.keys(STRINGS);
const KEY = 'navid-lessons-lang';
const vars = {};

function detect() {
  try {
    const saved = localStorage.getItem(KEY);
    if (LANGS.includes(saved)) return saved;
  } catch { /* storage blocked */ }
  return (navigator.language || '').toLowerCase().startsWith('lt') ? 'lt' : 'en';
}

let lang = detect();
export const getLang = () => lang;
export const locale = () => (lang === 'lt' ? 'lt-LT' : 'en-GB');

const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? `{${k}}`);
export const t = (key, v = {}) => fill(STRINGS[lang][key] ?? STRINGS.en[key] ?? key, { ...vars, ...v });

// Values used inside static strings, e.g. {wd} → "12:00–17:00"
export const setVars = (v) => Object.assign(vars, v);

export function fmtDuration(min) {
  const h = Math.floor(min / 60), m = min % 60;
  if (lang === 'lt') return m ? `${h} val. ${m} min` : `${h} val.`;
  return m ? `${h}h ${m}min` : `${h}h`;
}

export function applyStatic(root = document) {
  document.documentElement.lang = lang;
  document.title = t('meta.title');
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => el.setAttribute('aria-label', t(el.dataset.i18nAria)));
  root.querySelectorAll('[data-i18n-alt]').forEach((el) => el.setAttribute('alt', t(el.dataset.i18nAlt)));
  root.querySelectorAll('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
}

export function setLang(next) {
  if (!LANGS.includes(next)) return;
  lang = next;
  try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
  applyStatic();
}
