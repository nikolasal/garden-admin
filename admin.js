/* ==========================================================
   Admin JS (Supabase Auth + DB + Storage) + Password Reset
   - Login with email/password
   - Approve/Edit/Archive/Delete reviews
   - Mark Read/Archive/Delete messages
   - List files (contact-files bucket)
   - Forgot password + Recovery flow (change password)
   ========================================================== */

// ---------- SETTINGS ----------
const SUPABASE_URL = 'https://ttqieprmbcjvxumetshe.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR0cWllcHJtYmNqdnh1bWV0c2hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg3NTAwMzcsImV4cCI6MjA4NDMyNjAzN30.DlRPTl0QWYvMlUx4rM3-kond1iJ-flp2h-JBgVZYHu8';
const BUCKET_CONTACT_FILES = 'contact-files';

const sb = (window.supabase && window.supabase.createClient)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// ---------- UI helpers ----------
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

// ---------- Elements ----------
const loginView = document.getElementById('loginView');
const panelView = document.getElementById('panelView');
const loginForm = document.getElementById('loginForm');
const loginMsg = document.getElementById('loginMsg');

const forgotBtn = document.getElementById('forgotBtn');
const forgotMsg = document.getElementById('forgotMsg');

const resetBox = document.getElementById('resetBox');
const resetMsg = document.getElementById('resetMsg');
const saveNewPassBtn = document.getElementById('saveNewPassBtn');

const reviewsAdminList = document.getElementById('reviewsAdminList');
const messagesAdminList = document.getElementById('messagesAdminList');
const filesAdminList = document.getElementById('filesAdminList');

let CACHE = { reviews: [], messages: [], files: [] };
let STATE = {
  reviewsFilter: 'pending',
  messagesFilter: 'new',
  filesFilter: 'message',
  reviewsQuery: '',
  messagesQuery: '',
  filesQuery: '',
};

// ---------- Session / Admin check ----------
async function isAdminSession(){
  if(!sb) return false;
  const { data: userRes } = await sb.auth.getUser();
  const user = userRes?.user;
  if(!user) return false;

  const { data, error } = await sb.from('users')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();

  if(error) return false;
  return !!data?.is_admin;
}

async function ensureAdminOrLogout(){
  const ok = await isAdminSession();
  if(ok) return true;
  await sb?.auth.signOut();
  showLogin('Δεν έχεις δικαιώματα admin.');
  return false;
}

function showLogin(msg = ''){
  if(loginView) loginView.hidden = false;
  if(panelView) panelView.hidden = true;
  if(loginMsg) loginMsg.textContent = msg;
}

function showPanel(){
  if(loginView) loginView.hidden = true;
  if(panelView) panelView.hidden = false;
  if(loginMsg) loginMsg.textContent = '';
}

// ---------- Password reset helpers ----------
function currentAdminUrl(){
  // π.χ. https://site.gr/admin.html
  return `${window.location.origin}${window.location.pathname}`;
}
function isRecoveryUrl(){
  // supabase στέλνει tokens στο hash (#...)
  const h = (window.location.hash || '').toLowerCase();
  const q = (window.location.search || '').toLowerCase();
  return h.includes('type=recovery') || h.includes('access_token=') || q.includes('type=recovery');
}
function showResetUI(){
  if(resetBox) resetBox.hidden = false;
  if(forgotMsg) forgotMsg.textContent = 'Άλλαξε τον κωδικό σου παρακάτω.';
  showLogin('');
}

// ---------- Tabs ----------
document.querySelectorAll('.admin-tabs .tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.admin-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    document.querySelectorAll('.admin-tab').forEach(sec => {
      sec.hidden = sec.dataset.tab !== tab;
    });
  });
});

// ---------- Filters + search ----------
document.querySelectorAll('#tab-reviews .filter-btn').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('#tab-reviews .filter-btn').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  STATE.reviewsFilter = b.dataset.filter;
  renderReviews();
}));
document.getElementById('reviewsSearch')?.addEventListener('input', (e) => {
  STATE.reviewsQuery = (e.target.value || '').toLowerCase();
  renderReviews();
});

document.querySelectorAll('#tab-messages .msg-filter-btn').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('#tab-messages .msg-filter-btn').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  STATE.messagesFilter = b.dataset.filter;
  renderMessages();
}));
document.getElementById('messagesSearch')?.addEventListener('input', (e) => {
  STATE.messagesQuery = (e.target.value || '').toLowerCase();
  renderMessages();
});

document.querySelectorAll('#tab-files .file-filter-btn').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('#tab-files .file-filter-btn').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  STATE.filesFilter = b.dataset.filter;
  renderFiles();
}));
document.getElementById('filesSearch')?.addEventListener('input', (e) => {
  STATE.filesQuery = (e.target.value || '').toLowerCase();
  renderFiles();
});

// ---------- Login / Logout ----------
loginForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if(!sb){ showLogin('Λείπει ρύθμιση Supabase (URL/KEY).'); return; }

  const fd = new FormData(loginForm);
  const email = (fd.get('email')||'').toString().trim();
  const password = (fd.get('password')||'').toString();

  const submitBtn = loginForm.querySelector('.submit-btn');
  submitBtn?.classList.add('is-loading');
  submitBtn?.setAttribute('disabled','');
  if(loginMsg) loginMsg.textContent = '';

  const { error } = await sb.auth.signInWithPassword({ email, password });

  submitBtn?.classList.remove('is-loading');
  submitBtn?.removeAttribute('disabled');

  if(error){
    if(loginMsg) loginMsg.textContent = 'Λάθος email ή κωδικός.';
    return;
  }

  const ok = await ensureAdminOrLogout();
  if(ok){
    if(resetBox) resetBox.hidden = true;
    showPanel();
    await loadAll();
  }
});

document.getElementById('logoutBtn')?.addEventListener('click', async () => {
  await sb?.auth.signOut();
  showLogin('Αποσυνδέθηκες.');
});

document.getElementById('refreshBtn')?.addEventListener('click', async () => {
  const ok = await ensureAdminOrLogout();
  if(ok) await loadAll();
});

// ---------- Forgot password (send email) ----------
forgotBtn?.addEventListener('click', async () => {
  if(!sb){ if(forgotMsg) forgotMsg.textContent = 'Λείπει ρύθμιση Supabase.'; return; }

  const emailInput = loginForm?.querySelector('input[name="email"]');
  const email = (emailInput?.value || '').trim();

  if(!email){
    if(forgotMsg) forgotMsg.textContent = 'Γράψε πρώτα το email σου στο πεδίο Email.';
    return;
  }

  if(forgotMsg) forgotMsg.textContent = 'Στέλνω email επαναφοράς...';

  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: currentAdminUrl()
  });

  if(error){
    console.error(error);
    if(forgotMsg) forgotMsg.textContent = 'Σφάλμα: ' + error.message;
    return;
  }

  if(forgotMsg) forgotMsg.textContent = '✅ Στάλθηκε email επαναφοράς. Άνοιξε το link από το email.';
});

// ---------- Recovery: set new password ----------
saveNewPassBtn?.addEventListener('click', async () => {
  if(!sb) return;

  const p1 = (document.getElementById('newPass')?.value || '').trim();
  const p2 = (document.getElementById('newPass2')?.value || '').trim();

  if(!p1 || p1.length < 6){
    if(resetMsg) resetMsg.textContent = 'Βάλε κωδικό τουλάχιστον 6 χαρακτήρες.';
    return;
  }
  if(p1 !== p2){
    if(resetMsg) resetMsg.textContent = 'Οι κωδικοί δεν ταιριάζουν.';
    return;
  }

  if(resetMsg) resetMsg.textContent = 'Αποθήκευση...';
  saveNewPassBtn.classList.add('is-loading');
  saveNewPassBtn.setAttribute('disabled','');

  const { error } = await sb.auth.updateUser({ password: p1 });

  saveNewPassBtn.classList.remove('is-loading');
  saveNewPassBtn.removeAttribute('disabled');

  if(error){
    console.error(error);
    if(resetMsg) resetMsg.textContent = 'Σφάλμα: ' + error.message;
    return;
  }

  if(resetMsg) resetMsg.textContent = '✅ Ο κωδικός άλλαξε! Κάνε login με τον νέο κωδικό.';
  // καθαρίζουμε tokens από URL
  history.replaceState({}, document.title, window.location.pathname);

  // Προτείνω sign out ώστε να κάνεις καθαρό login μετά
  await sb.auth.signOut();
});

// ---------- Data load ----------
async function loadAll(){
  const ok = await ensureAdminOrLogout();
  if(!ok) return;

  // Reviews
  const r = await sb.from('reviews')
    .select('id,name,rating,content,approved,archived,created_at')
    .order('created_at', { ascending: false })
    .limit(300);
  if(r.error){ console.warn(r.error); showToast('Σφάλμα φόρτωσης κριτικών'); }
  CACHE.reviews = r.data || [];

  // Messages
  const m = await sb.from('messages')
    .select('id,name,phone,message,status,archived,created_at')
    .order('created_at', { ascending: false })
    .limit(500);
  if(m.error){ console.warn(m.error); showToast('Σφάλμα φόρτωσης μηνυμάτων'); }
  CACHE.messages = m.data || [];

  // Files
  const f = await sb.from('files')
    .select('id,owner_type,owner_id,path,original_name,size,mime,created_at')
    .order('created_at', { ascending: false })
    .limit(500);
  if(f.error){ console.warn(f.error); }
  CACHE.files = f.data || [];

  renderReviews();
  renderMessages();
  renderFiles();
}

// ---------- Render: Reviews ----------
function matchesQuery(obj, q){
  if(!q) return true;
  const hay = `${obj.name||''} ${obj.text||''}`.toLowerCase();
  return hay.includes(q);
}

function filterReviewsData(){
  const f = STATE.reviewsFilter;
  return CACHE.reviews.filter(r => {
    if(!matchesQuery(r, STATE.reviewsQuery)) return false;
    if(f === 'pending') return !r.approved && !r.archived;
    if(f === 'approved') return r.approved && !r.archived;
    if(f === 'archived') return !!r.archived;
    return true;
  });
}

function renderReviews(){
  if(!reviewsAdminList) return;
  const rows = filterReviewsData();
  if(rows.length === 0){
    reviewsAdminList.innerHTML = '<div class="admin-item"><div class="admin-item-text">Δεν βρέθηκαν κριτικές.</div></div>';
    return;
  }
  reviewsAdminList.innerHTML = rows.map(r => {
    const meta = `${escapeHtml(r.name)} · ${renderStars(r.rating)} · <small>${new Date(r.created_at).toLocaleString('el-GR')}</small>`;
    const status = r.archived ? 'ARCHIVED' : (r.approved ? 'APPROVED' : 'PENDING');
    return `
      <div class="admin-item" data-id="${r.id}">
        <div class="admin-item-main">
          <div>${meta} <small style="margin-left:8px; opacity:.8">(${status})</small></div>
          <div class="admin-item-text">${escapeHtml(r.text)}</div>
        </div>
        <div class="admin-item-actions">
          ${!r.approved && !r.archived ? `<button class="btn" data-action="approve">Εγκρίνω</button>` : ''}
          <button class="btn btn-ghost" data-action="edit">Επεξεργασία</button>
          <button class="btn btn-ghost" data-action="toggle-archive">${r.archived ? 'Επαναφορά' : 'Αρχειοθέτηση'}</button>
          <button class="btn btn-ghost" data-action="delete">Διαγραφή</button>
        </div>
      </div>
    `;
  }).join('');

  reviewsAdminList.querySelectorAll('.admin-item').forEach(card => {
    const id = card.getAttribute('data-id');
    card.addEventListener('click', async (e) => {
      const btn = e.target.closest('button');
      if(!btn) return;
      const action = btn.getAttribute('data-action');
      e.preventDefault();
      e.stopPropagation();

      if(action === 'approve') return approveReview(id);
      if(action === 'edit') return editReview(id);
      if(action === 'toggle-archive') return toggleArchiveReview(id);
      if(action === 'delete') return deleteReview(id);
    });
  });
}

async function approveReview(id){
  const ok = await ensureAdminOrLogout();
  if(!ok) return;
  const { error } = await sb.from('reviews').update({ approved: true }).eq('id', id);
  if(error){ showToast('Σφάλμα έγκρισης'); return; }
  showToast('✅ Εγκρίθηκε');
  await loadAll();
}

async function editReview(id){
  const row = CACHE.reviews.find(r => r.id === id);
  if(!row) return;
  const newText = prompt('Κείμενο κριτικής:', row.text || '');
  if(newText === null) return;
  const newRating = Number(prompt('Βαθμολογία (1-5):', String(row.rating || 5)));
  const rating = Math.max(1, Math.min(5, Number.isFinite(newRating) ? newRating : (row.rating||5)));
  const { error } = await sb.from('reviews').update({ text: newText, rating }).eq('id', id);
  if(error){ showToast('Σφάλμα επεξεργασίας'); return; }
  showToast('✅ Ενημερώθηκε');
  await loadAll();
}

async function toggleArchiveReview(id){
  const row = CACHE.reviews.find(r => r.id === id);
  if(!row) return;
  const { error } = await sb.from('reviews').update({ archived: !row.archived }).eq('id', id);
  if(error){ showToast('Σφάλμα αρχειοθέτησης'); return; }
  showToast(row.archived ? '✅ Επαναφέρθηκε' : '✅ Αρχειοθετήθηκε');
  await loadAll();
}

async function deleteReview(id){
  if(!confirm('Διαγραφή κριτικής;')) return;
  const { error } = await sb.from('reviews').delete().eq('id', id);
  if(error){ showToast('Σφάλμα διαγραφής'); return; }
  showToast('🗑️ Διαγράφηκε');
  await loadAll();
}

// ---------- Render: Messages ----------
function filterMessagesData(){
  const f = STATE.messagesFilter;
  return CACHE.messages.filter(m => {
    const q = STATE.messagesQuery;
    if(q){
      const hay = `${m.name||''} ${m.phone||''} ${m.message||''}`.toLowerCase();
      if(!hay.includes(q)) return false;
    }
    if(f === 'archived') return !!m.archived;
    if(f === 'new') return !m.archived && (m.status || 'new') === 'new';
    if(f === 'read') return !m.archived && (m.status || 'new') === 'read';
    return true;
  });
}

function renderMessages(){
  if(!messagesAdminList) return;
  const rows = filterMessagesData();
  if(rows.length === 0){
    messagesAdminList.innerHTML = '<div class="admin-item"><div class="admin-item-text">Δεν βρέθηκαν μηνύματα.</div></div>';
    return;
  }
  messagesAdminList.innerHTML = rows.map(m => {
    const status = m.archived ? 'ARCHIVED' : ((m.status || 'new').toUpperCase());
    return `
      <div class="admin-item" data-id="${m.id}">
        <div class="admin-item-main">
          <div>${escapeHtml(m.name)} · <small>${escapeHtml(m.phone||'')}</small> · <small>${new Date(m.created_at).toLocaleString('el-GR')}</small>
            <small style="margin-left:8px; opacity:.8">(${status})</small>
          </div>
          <div class="admin-item-text">${escapeHtml(m.message)}</div>
        </div>
        <div class="admin-item-actions">
          ${!m.archived && (m.status||'new') === 'new' ? `<button class="btn" data-action="mark-read">Σαν διαβασμένο</button>` : ''}
          <button class="btn btn-ghost" data-action="toggle-archive">${m.archived ? 'Επαναφορά' : 'Αρχειοθέτηση'}</button>
          <button class="btn btn-ghost" data-action="copy">Αντιγραφή</button>
          <button class="btn btn-ghost" data-action="delete">Διαγραφή</button>
        </div>
      </div>
    `;
  }).join('');

  messagesAdminList.querySelectorAll('.admin-item').forEach(card => {
    const id = card.getAttribute('data-id');
    card.addEventListener('click', async (e) => {
      const btn = e.target.closest('button');
      if(!btn) return;
      const action = btn.getAttribute('data-action');
      e.preventDefault();
      e.stopPropagation();
      if(action === 'mark-read') return markMessageRead(id);
      if(action === 'toggle-archive') return toggleArchiveMessage(id);
      if(action === 'copy') return copyMessage(id);
      if(action === 'delete') return deleteMessage(id);
    });
  });
}

async function markMessageRead(id){
  const { error } = await sb.from('messages').update({ status: 'read' }).eq('id', id);
  if(error){ showToast('Σφάλμα'); return; }
  showToast('✅ Σημειώθηκε');
  await loadAll();
}

async function toggleArchiveMessage(id){
  const row = CACHE.messages.find(m => m.id === id);
  if(!row) return;
  const { error } = await sb.from('messages').update({ archived: !row.archived }).eq('id', id);
  if(error){ showToast('Σφάλμα'); return; }
  showToast(row.archived ? '✅ Επαναφέρθηκε' : '✅ Αρχειοθετήθηκε');
  await loadAll();
}

async function copyMessage(id){
  const row = CACHE.messages.find(m => m.id === id);
  if(!row) return;
  const text = `Όνομα: ${row.name}\nΤηλέφωνο: ${row.phone||''}\n\nΜήνυμα:\n${row.message}\n\nID: ${row.id}`;
  try{
    await navigator.clipboard.writeText(text);
    showToast('📋 Αντιγράφηκε');
  }catch{
    prompt('Αντιγραφή:', text);
  }
}

async function deleteMessage(id){
  if(!confirm('Διαγραφή μηνύματος;')) return;
  const { error } = await sb.from('messages').delete().eq('id', id);
  if(error){ showToast('Σφάλμα διαγραφής'); return; }
  showToast('🗑️ Διαγράφηκε');
  await loadAll();
}

// ---------- Render: Files ----------
function filterFilesData(){
  const f = STATE.filesFilter;
  const q = STATE.filesQuery;
  return CACHE.files.filter(x => {
    if(f !== 'all' && x.owner_type !== f) return false;
    if(!q) return true;
    const hay = `${x.original_name||''} ${x.path||''} ${x.owner_id||''}`.toLowerCase();
    return hay.includes(q);
  });
}

function publicUrlForFile(path){
  const res = sb.storage.from(BUCKET_CONTACT_FILES).getPublicUrl(path);
  return res?.data?.publicUrl || '';
}

function renderFiles(){
  if(!filesAdminList) return;
  if(!CACHE.files.length){
    filesAdminList.innerHTML = '<div class="admin-item"><div class="admin-item-text">Δεν υπάρχουν αρχεία (ή δεν έχεις φτιάξει τον πίνακα files/bucket).</div></div>';
    return;
  }
  const rows = filterFilesData();
  if(rows.length === 0){
    filesAdminList.innerHTML = '<div class="admin-item"><div class="admin-item-text">Δεν βρέθηκαν αρχεία.</div></div>';
    return;
  }
  filesAdminList.innerHTML = rows.map(x => {
    const url = x.path ? publicUrlForFile(x.path) : '';
    const sizeKb = x.size ? `${Math.round(x.size/1024)} KB` : '';
    return `
      <div class="admin-item" data-id="${x.id}">
        <div class="admin-item-main">
          <div>
            ${escapeHtml(x.original_name || 'Αρχείο')} · <small>${escapeHtml(x.owner_type)}:${escapeHtml(x.owner_id)}</small>
            <small style="margin-left:8px; opacity:.8">${sizeKb}</small>
          </div>
          <div class="admin-item-text"><small>${escapeHtml(x.path||'')}</small></div>
        </div>
        <div class="admin-item-actions">
          ${url ? `<a class="btn" href="${escapeHtml(url)}" target="_blank" rel="noopener">Άνοιγμα</a>` : ''}
          <button class="btn btn-ghost" data-action="delete">Διαγραφή</button>
        </div>
      </div>
    `;
  }).join('');

  filesAdminList.querySelectorAll('.admin-item').forEach(card => {
    const id = card.getAttribute('data-id');
    card.addEventListener('click', async (e) => {
      const btn = e.target.closest('button');
      if(!btn) return;
      if(btn.getAttribute('data-action') === 'delete'){
        e.preventDefault();
        e.stopPropagation();
        return deleteFileRecord(id);
      }
    });
  });
}

async function deleteFileRecord(id){
  const row = CACHE.files.find(x => x.id === id);
  if(!row) return;
  if(!confirm('Διαγραφή αρχείου από DB και Storage;')) return;

  if(row.path){
    const { error: rmErr } = await sb.storage.from(BUCKET_CONTACT_FILES).remove([row.path]);
    if(rmErr) console.warn('Storage remove error:', rmErr);
  }
  const { error } = await sb.from('files').delete().eq('id', id);
  if(error){ showToast('Σφάλμα διαγραφής'); return; }
  showToast('🗑️ Διαγράφηκε');
  await loadAll();
}

// ---------- Boot ----------
(async function init(){
  if(!sb){ showLogin('Λείπει ρύθμιση Supabase (URL/KEY).'); return; }

  // Αν έρχεσαι από reset email link → δείξε reset UI και ΜΗΝ κάνεις admin-check εδώ.
  if(isRecoveryUrl()){
    showResetUI();
    return;
  }

  const ok = await isAdminSession();
  if(!ok){ showLogin(''); return; }

  const admin = await ensureAdminOrLogout();
  if(!admin) return;

  showPanel();
  await loadAll();
})();
