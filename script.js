/* ==========================================================
   Public site JS (Netlify + Supabase)
   - Reviews: submit -> pending (approved=false), list -> approved only
   - Contact: submit -> DB + optional file uploads (Supabase Storage)
   - UI helpers kept (menu, toasts, file previews)
   ========================================================== */

// ---------- SETTINGS (fill these) ----------
const SUPABASE_URL = 'https://ttqieprmbcjvxumetshe.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR0cWllcHJtYmNqdnh1bWV0c2hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg3NTAwMzcsImV4cCI6MjA4NDMyNjAzN30.DlRPTl0QWYvMlUx4rM3-kond1iJ-flp2h-JBgVZYHu8';

// Storage bucket names (create them in Supabase Storage)
const BUCKET_CONTACT_FILES = 'contact-files';

// ---------- Supabase client ----------
const sb = (window.supabase && window.supabase.createClient)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// ---------- Small helpers ----------
function escapeHtml(s){
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#039;');
}

function renderStars(n){
  const r = Math.max(1, Math.min(5, Number(n) || 5));
  return '★'.repeat(r) + '☆'.repeat(5 - r);
}

function formatSize(bytes){
  if(bytes < 1024) return bytes + ' B';
  if(bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB';
  return (bytes/(1024*1024)).toFixed(1) + ' MB';
}

// ---------- Year ----------
const yearEl = document.getElementById('year');
if(yearEl) yearEl.textContent = new Date().getFullYear();

// ---------- Mobile menu ----------
const burger = document.getElementById('burger');
const mobileMenu = document.getElementById('mobileMenu');
if (burger && mobileMenu) {
  function openMenu() {
    mobileMenu.hidden = false;
    mobileMenu.setAttribute('aria-hidden', 'false');
    burger.setAttribute('aria-expanded', 'true');
    mobileMenu.classList.add('open');
    const first = mobileMenu.querySelector('a, button, [tabindex]:not([tabindex="-1"])');
    first?.focus();
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('click', onDocClick);
    window.addEventListener('resize', onResize);
  }
  function closeMenu(returnFocus = true) {
    mobileMenu.hidden = true;
    mobileMenu.setAttribute('aria-hidden', 'true');
    burger.setAttribute('aria-expanded', 'false');
    mobileMenu.classList.remove('open');
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('click', onDocClick);
    window.removeEventListener('resize', onResize);
    if (returnFocus) burger.focus();
  }
  function toggleMenu() {
    const isOpen = burger.getAttribute('aria-expanded') === 'true' && !mobileMenu.hidden;
    if (isOpen) closeMenu(); else openMenu();
  }
  function onKeyDown(e) {
    if (e.key === 'Escape') closeMenu();
    if (e.key === 'Tab' && !mobileMenu.hidden) {
      const focusable = Array.from(mobileMenu.querySelectorAll('a, button, input, textarea, [tabindex]:not([tabindex="-1"])'))
        .filter(n => !n.hasAttribute('disabled'));
      if (focusable.length === 0) return;
      const idx = focusable.indexOf(document.activeElement);
      if (e.shiftKey && idx === 0) { e.preventDefault(); focusable[focusable.length - 1].focus(); }
      else if (!e.shiftKey && idx === focusable.length - 1) { e.preventDefault(); focusable[0].focus(); }
    }
  }
  function onDocClick(e) { if (!mobileMenu.contains(e.target) && e.target !== burger) closeMenu(); }
  function onResize() { if (window.innerWidth > 980 && !mobileMenu.hidden) closeMenu(false); }
  burger.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(); });
  mobileMenu.addEventListener('click', (e) => { const a = e.target.closest('a'); if (a) closeMenu(); });
  if (!mobileMenu.hasAttribute('aria-hidden')) mobileMenu.setAttribute('aria-hidden', String(mobileMenu.hidden));
  if (!burger.hasAttribute('aria-expanded')) burger.setAttribute('aria-expanded', 'false');
}

// ---------- Toast ----------
function showToast(text, timeout = 4200){
  const container = document.getElementById('toastContainer');
  if(!container) return;
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = text;
  container.appendChild(t);
  requestAnimationFrame(()=> t.classList.add('in'));
  setTimeout(()=>{ t.classList.remove('in'); setTimeout(()=> t.remove(), 300); }, timeout);
}

// ---------- File upload preview (contact form) ----------
const fileInput = document.getElementById('gardenFiles');
const filePreview = document.getElementById('filePreview');
fileInput?.addEventListener('change', (ev) => {
  const files = Array.from(ev.target.files || []);
  if(!filePreview) return;
  filePreview.innerHTML = '';
  if(files.length === 0) return;

  const maxFiles = 12;
  const maxSize = 10 * 1024 * 1024; // 10MB
  if(files.length > maxFiles){
    filePreview.textContent = `Επέλεξες ${files.length} αρχεία — επιτρέπονται έως ${maxFiles}.`;
    return;
  }

  files.forEach(file => {
    const item = document.createElement('div');
    item.className = 'thumb';

    const info = document.createElement('div');
    info.className = 'thumb-info';
    info.textContent = `${file.name} · ${formatSize(file.size)}`;

    if(file.size > maxSize){
      item.className = 'file-item';
      item.textContent = `${file.name} — πολύ μεγάλο (${formatSize(file.size)})`;
      filePreview.appendChild(item);
      return;
    }

    if(file.type.startsWith('image/')){
      const img = document.createElement('img');
      img.alt = file.name;
      const reader = new FileReader();
      reader.onload = () => { img.src = String(reader.result); };
      reader.readAsDataURL(file);
      item.appendChild(img);
    } else {
      const icon = document.createElement('div');
      icon.className = 'file-icon';
      icon.textContent = '📄';
      item.appendChild(icon);
    }

    item.appendChild(info);
    filePreview.appendChild(item);
  });
});

// ---------- Reviews (Supabase) ----------
const reviewForm = document.getElementById('reviewForm');
const reviewList = document.getElementById('reviewList');
const reviewMsg = document.getElementById('reviewMessage');
let currentRating = 5;

// Star UI
(() => {
  const starsWrap = document.querySelector('#reviewForm .stars') || document.querySelector('.stars');
  if(!starsWrap) return;
  const stars = Array.from(starsWrap.querySelectorAll('.star'));
  function setActive(n){ stars.forEach(s => s.classList.toggle('active', Number(s.dataset.value) <= n)); }
  setActive(currentRating);
  stars.forEach(s => {
    s.addEventListener('click', () => { currentRating = Number(s.dataset.value); setActive(currentRating); });
    s.addEventListener('mouseover', () => setActive(Number(s.dataset.value)));
    s.addEventListener('mouseleave', () => setActive(currentRating));
  });
})();

async function loadPublicReviews(){
  if(!sb || !reviewList) return;
  const { data, error } = await sb
    .from('reviews')
    .select('id,name,rating,text,created_at')
    .eq('approved', true)
    .eq('archived', false)
    .order('created_at', { ascending: false })
    .limit(30);
  if(error){
    console.warn('Reviews fetch error:', error);
    reviewList.innerHTML = '<p class="form-hint">Δεν μπορώ να φορτώσω κριτικές αυτή τη στιγμή.</p>';
    return;
  }
  if(!data || data.length === 0){
    reviewList.innerHTML = '<p class="form-hint">Δεν υπάρχουν κριτικές ακόμη — γίνε ο πρώτος!</p>';
    return;
  }
  reviewList.innerHTML = data.map(r => `
    <div class="review-item">
      <div style="flex:1">
        <div class="review-meta">
          <div class="review-name">${escapeHtml(r.name)}</div>
          <div class="review-stars">${renderStars(r.rating)}</div>
          <div class="review-date">${new Date(r.created_at).toLocaleString('el-GR')}</div>
        </div>
        <div class="review-text">${escapeHtml(r.text)}</div>
      </div>
    </div>
  `).join('');
}

if(reviewForm){
  reviewForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if(!sb){
      reviewMsg.textContent = 'Λείπει η ρύθμιση Supabase. Άνοιξε το script.js και βάλε URL/KEY.';
      return;
    }
    const fd = new FormData(reviewForm);
    const name = (fd.get('rname')||'').toString().trim();
    const text = (fd.get('rtext')||'').toString().trim();
    const rating = Number(currentRating) || 5;
    if(!name || !text){ reviewMsg.textContent = 'Συμπλήρωσε όνομα και κείμενο κριτικής.'; return; }

    const submitBtn = reviewForm.querySelector('.submit-btn');
    submitBtn?.classList.add('is-loading');
    submitBtn?.setAttribute('disabled','');
    reviewMsg.textContent = '';

    const { error } = await sb.from('reviews').insert({
   name,
   rating,
   content: text,   // ✅ ΣΩΣΤΟ
   approved: false,
   archived: false,
});

    submitBtn?.classList.remove('is-loading');
    submitBtn?.removeAttribute('disabled');

    if(error){
      console.warn('Review insert error:', error);
      reviewMsg.textContent = 'Σφάλμα κατά την υποβολή. Δοκίμασε ξανά.';
      return;
    }

    reviewForm.reset();
    currentRating = 5;
    // reset stars
    document.querySelectorAll('#reviewForm .star').forEach(s => s.classList.toggle('active', Number(s.dataset.value) <= 5));

    reviewMsg.textContent = 'Η κριτική στάλθηκε προς έγκριση. Θα εμφανιστεί αφού την εγκρίνεις.';
    showToast('✅ Ευχαριστούμε για την κριτική σου!');
  });
}

// ---------- Contact (Supabase) ----------
const contactForm = document.getElementById('contactForm');
if(contactForm){
  contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if(!sb){
      showToast('Λείπει η ρύθμιση Supabase. Άνοιξε το script.js και βάλε URL/KEY.', 5200);
      return;
    }

    const f = e.currentTarget;
    const fd = new FormData(f);
    const name = (fd.get('name')||'').toString().trim();
    const phone = (fd.get('phone')||'').toString().trim();
    const message = (fd.get('message')||'').toString().trim();

    const submitBtn = f.querySelector('button[type="submit"]');
    submitBtn?.setAttribute('disabled','');
    submitBtn?.classList.add('is-loading');

    try{
      // 1) Create message row first (so we get an ID)
      const { data: rows, error: insertErr } = await sb
        .from('messages')
        .insert({ name, phone, message, status: 'new', archived: false })
        .select('id')
        .limit(1);
      if(insertErr) throw insertErr;
      const messageId = rows?.[0]?.id;

      // 2) Upload attachments (optional)
      const files = Array.from(fileInput?.files || []);
      const uploaded = [];
      for(const file of files){
        // basic limits
        if(file.size > 10 * 1024 * 1024) continue;
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `messages/${messageId}/${Date.now()}_${safeName}`;
        const { error: upErr } = await sb.storage
          .from(BUCKET_CONTACT_FILES)
          .upload(path, file, { upsert: false });
        if(upErr) throw upErr;
        uploaded.push({ owner_type: 'message', owner_id: messageId, path, original_name: file.name, size: file.size, mime: file.type });
      }

      // 3) Save file metadata
      if(uploaded.length){
        const { error: filesErr } = await sb.from('files').insert(uploaded);
        if(filesErr) throw filesErr;
      }

      f.reset();
      if(filePreview) filePreview.innerHTML = '';
      showToast('✅ Το μήνυμα στάλθηκε. Θα σου απαντήσω σύντομα!');
    }catch(err){
      console.warn('Contact submit error:', err);
      showToast('❌ Σφάλμα αποστολής. Δοκίμασε ξανά.', 5200);
    }finally{
      submitBtn?.removeAttribute('disabled');
      submitBtn?.classList.remove('is-loading');
    }
  });
}

// ---------- Admin entry point (simple) ----------
// Αν θες, άφησε το κουμπί "Admin" να σε πάει στη σελίδα admin.html
document.getElementById('openAdminBtn')?.addEventListener('click', () => {
  window.location.href = 'admin.html';
});

// ---------- Init ----------
loadPublicReviews();
