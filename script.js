const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

const app = $("#app");
const modalRoot = $("#modal-root");

const state = {
  user: null,
  tab: "General",
  search: "",
  sidebarOpen: false,
  files: [],
  editingPost: null
};

const tabs = ["General", "My Class", "Off Topic"];

function uid(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function esc(value = "") {
  return String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${units[i]}`;
}

function fileFormat(name = "") {
  const ext = name.includes(".") ? name.split(".").pop().toUpperCase() : "FILE";
  return ext.slice(0, 8);
}

function iconForFile(name = "") {
  const ext = fileFormat(name);
  if (["PNG","JPG","JPEG","GIF","WEBP","SVG"].includes(ext)) return "image";
  if (["MP4","MOV","WEBM","AVI"].includes(ext)) return "video";
  if (["MP3","WAV","OGG","M4A"].includes(ext)) return "music-2";
  if (["PDF"].includes(ext)) return "file-text";
  if (["ZIP","RAR","7Z"].includes(ext)) return "archive";
  if (["DOC","DOCX","TXT"].includes(ext)) return "file-text";
  if (["XLS","XLSX","CSV"].includes(ext)) return "table-2";
  if (["PPT","PPTX"].includes(ext)) return "presentation";
  return "file";
}

function initials(user) {
  return (user.displayName || user.username || "?").split(/\s+/).map(x => x[0]).join("").slice(0, 2).toUpperCase();
}

function toast(text, type = "normal") {
  Toastify({
    text,
    duration: 2400,
    gravity: "bottom",
    position: "right",
    close: true,
    style: { background: type === "error" ? "#242424" : "#151515", color: "#f4f4f4", border: "1px solid #3a3a3a", borderRadius: "12px", boxShadow: "0 15px 45px rgba(0,0,0,.35)" }
  }).showToast();
}

function currentUser() {
  return DemoServer.state.users.find(u => u.id === state.user?.id) || null;
}

function roleOf(user) {
  return user?.role || "student";
}

function canPost(user = currentUser()) {
  return ["teacher", "owner"].includes(roleOf(user)) && !user?.banned && !user?.muted;
}

function seedOwnerIfNeeded() {
  const ownerExists = DemoServer.state.users.some(u => u.username.toLowerCase() === "wvowner");
  if (!ownerExists) return;
}

function render() {
  if (!state.user) {
    renderAuth();
    return;
  }
  const user = currentUser();
  if (!user || user.banned) {
    state.user = null;
    renderAuth();
    return;
  }
  renderShell(user);
  lucide.createIcons();
}

function renderAuth() {
  app.innerHTML = `
    <main class="min-h-screen grid place-items-center p-5">
      <section class="glass w-full max-w-[430px] rounded-[22px] p-6 sm:p-8" id="auth-card">
        <div class="flex items-center gap-3 mb-8">
          <div class="w-11 h-11 rounded-[13px] bg-white text-black grid place-items-center font-extrabold text-lg">C</div>
          <div>
            <div class="font-bold tracking-tight text-lg">ClassShare</div>
            <div class="text-xs text-zinc-500">Simple class file sharing</div>
          </div>
        </div>
        <div class="flex p-1 rounded-[13px] bg-white/[.035] border border-white/[.06] mb-6">
          <button class="auth-tab flex-1 h-10 rounded-[10px] text-sm font-semibold bg-white/[.09]" data-auth="login">Log in</button>
          <button class="auth-tab flex-1 h-10 rounded-[10px] text-sm text-zinc-500" data-auth="signup">Sign up</button>
        </div>
        <div id="auth-form"></div>
        <div class="mt-6 pt-5 border-t border-white/[.06] text-[11px] leading-5 text-zinc-600">
          Frontend test mode stores demo data in this browser. JSONBin syncing is optional and is configured from the owner panel.
        </div>
      </section>
    </main>
  `;
  renderAuthForm("login");
  $$(".auth-tab").forEach(btn => btn.onclick = () => {
    $$(".auth-tab").forEach(x => x.classList.remove("bg-white/[.09]", "text-white"));
    $$(".auth-tab").forEach(x => x.classList.add("text-zinc-500"));
    btn.classList.add("bg-white/[.09]", "text-white");
    btn.classList.remove("text-zinc-500");
    renderAuthForm(btn.dataset.auth);
  });
  lucide.createIcons();
  gsap.from("#auth-card", { y: 16, opacity: 0, duration: .45, ease: "power2.out" });
}

function renderAuthForm(mode) {
  const root = $("#auth-form");
  if (mode === "signup") {
    root.innerHTML = `
      <form id="signup-form" class="space-y-4">
        <div>
          <label class="text-xs text-zinc-400 block mb-2">Display name</label>
          <input class="field" name="displayName" maxlength="32" placeholder="e.g. Alex" required>
        </div>
        <div>
          <label class="text-xs text-zinc-400 block mb-2">Username</label>
          <input class="field" name="username" maxlength="24" autocomplete="username" placeholder="Choose a username" required>
        </div>
        <div>
          <label class="text-xs text-zinc-400 block mb-2">Password</label>
          <input class="field" name="password" type="password" minlength="6" autocomplete="new-password" placeholder="At least 6 characters" required>
        </div>
        <button class="btn btn-dark w-full" type="submit">Create account <i data-lucide="arrow-right" class="w-4 h-4"></i></button>
      </form>
    `;
    $("#signup-form").onsubmit = signup;
  } else {
    root.innerHTML = `
      <form id="login-form" class="space-y-4">
        <div>
          <label class="text-xs text-zinc-400 block mb-2">Username</label>
          <input class="field" name="username" autocomplete="username" placeholder="Your username" required>
        </div>
        <div>
          <label class="text-xs text-zinc-400 block mb-2">Password</label>
          <input class="field" name="password" type="password" autocomplete="current-password" placeholder="Your password" required>
        </div>
        <button class="btn btn-dark w-full" type="submit">Log in <i data-lucide="log-in" class="w-4 h-4"></i></button>
      </form>
    `;
    $("#login-form").onsubmit = login;
  }
  lucide.createIcons();
}

async function hashPassword(password) {
  const data = new TextEncoder().encode(password);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2, "0")).join("");
}

async function signup(e) {
  e.preventDefault();
  const form = new FormData(e.currentTarget);
  const username = String(form.get("username")).trim();
  const displayName = String(form.get("displayName")).trim();
  const password = String(form.get("password"));
  if (!/^[a-zA-Z0-9_.-]{3,24}$/.test(username)) return toast("Use 3–24 letters, numbers, dots, dashes or underscores.", "error");
  if (username.toLowerCase() === "wvowner") return toast("That username is reserved.", "error");
  if (DemoServer.state.users.some(u => u.username.toLowerCase() === username.toLowerCase())) return toast("Username already exists.", "error");
  const user = {
    id: uid("user"),
    username,
    displayName,
    passwordHash: await hashPassword(password),
    role: "student",
    banned: false,
    muted: false,
    createdAt: Date.now()
  };
  DemoServer.state.users.push(user);
  DemoServer.save();
  state.user = { id: user.id };
  toast("Account created.");
  render();
}

async function login(e) {
  e.preventDefault();
  const form = new FormData(e.currentTarget);
  const username = String(form.get("username")).trim();
  const password = String(form.get("password"));
  const user = DemoServer.state.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user || user.passwordHash !== await hashPassword(password)) return toast("Incorrect username or password.", "error");
  if (user.banned) return toast("This account is banned.", "error");
  state.user = { id: user.id };
  toast(`Welcome back, ${user.displayName}.`);
  render();
}

function renderShell(user) {
  const postCount = DemoServer.state.posts.filter(p => p.authorId === user.id).length;
  app.innerHTML = `
    <div class="min-h-screen flex">
      <div class="mobile-overlay fixed inset-0 z-40 hidden overlay" id="mobile-overlay"></div>
      <aside class="sidebar glass m-3 rounded-[20px] p-3 flex flex-col shrink-0" id="sidebar">
        <div class="px-2 py-3 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-[12px] bg-white text-black grid place-items-center font-extrabold">C</div>
            <div>
              <div class="font-bold tracking-tight">ClassShare</div>
              <div class="text-[10px] text-zinc-600">CLASS NETWORK</div>
            </div>
          </div>
          <button class="btn btn-ghost icon-btn lg:hidden" id="close-sidebar"><i data-lucide="x"></i></button>
        </div>
        <div class="mt-5 px-2 text-[10px] uppercase tracking-[.16em] text-zinc-600">Spaces</div>
        <nav class="mt-2 space-y-1">
          ${tabs.map(t => `<button class="nav-item ${state.tab === t ? "active" : ""}" data-tab="${esc(t)}"><i data-lucide="${t === "General" ? "globe-2" : t === "My Class" ? "graduation-cap" : "message-circle"}" class="w-4 h-4"></i><span>${esc(t)}</span></button>`).join("")}
        </nav>
        ${canPost(user) ? `<button class="btn btn-dark w-full mt-5" id="new-post"><i data-lucide="plus" class="w-4 h-4"></i>New post</button>` : ""}
        <div class="mt-auto">
          <div class="glass-soft rounded-[15px] p-3 mb-2">
            <div class="flex items-center gap-2">
              <div class="avatar w-9 h-9 text-xs">${esc(initials(user))}</div>
              <div class="min-w-0 flex-1">
                <div class="font-semibold text-sm truncate">${esc(user.displayName)}</div>
                <div class="text-[11px] text-zinc-600 truncate">@${esc(user.username)}</div>
              </div>
              ${user.role === "owner" ? `<span class="badge owner">OWNER</span>` : user.role === "teacher" ? `<span class="badge teacher">TEACHER</span>` : ""}
            </div>
          </div>
          ${user.role === "owner" ? `<button class="nav-item" id="admin-btn"><i data-lucide="shield-check" class="w-4 h-4"></i><span>Owner panel</span></button>` : ""}
          <button class="nav-item" id="logout"><i data-lucide="log-out" class="w-4 h-4"></i><span>Log out</span></button>
        </div>
      </aside>

      <main class="flex-1 min-w-0">
        <header class="sticky top-0 z-30 px-3 sm:px-5 pt-3">
          <div class="glass rounded-[18px] h-[66px] px-3 sm:px-4 flex items-center gap-3">
            <button class="btn btn-ghost icon-btn lg:hidden" id="open-sidebar"><i data-lucide="menu"></i></button>
            <div class="min-w-0">
              <div class="font-bold truncate">${esc(state.tab)}</div>
              <div class="text-[11px] text-zinc-600 hidden sm:block">Shared files and class updates</div>
            </div>
            <div class="ml-auto relative w-full max-w-[280px] hidden sm:block">
              <i data-lucide="search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600"></i>
              <input id="search" class="field h-[42px] min-h-[42px] pl-10 pr-3" placeholder="Search posts..." value="${esc(state.search)}">
            </div>
            <button class="btn btn-ghost icon-btn sm:hidden" id="search-mobile"><i data-lucide="search"></i></button>
            <button class="btn btn-ghost icon-btn" id="refresh"><i data-lucide="rotate-cw"></i></button>
          </div>
        </header>
        <div class="page-pad p-5 max-w-[1050px] mx-auto">
          <section class="glass rounded-[20px] p-5 sm:p-6 mb-5">
            <div class="flex flex-col md:flex-row md:items-end gap-5">
              <div class="flex-1">
                <div class="text-[11px] uppercase tracking-[.18em] text-zinc-600 mb-2">Class feed</div>
                <h1 class="text-2xl sm:text-3xl font-extrabold tracking-[-.04em]">${esc(state.tab)}</h1>
                <p class="text-sm text-zinc-500 mt-2">Find files, announcements and useful resources without digging through folders.</p>
              </div>
              <div class="grid grid-cols-2 gap-2 w-full md:w-auto">
                <div class="glass-soft stat-card rounded-[14px] px-4 py-3">
                  <div class="text-[10px] text-zinc-600 uppercase tracking-wider">Posts</div>
                  <div class="text-lg font-bold mt-1">${DemoServer.state.posts.filter(p => p.space === state.tab).length}</div>
                </div>
                <div class="glass-soft stat-card rounded-[14px] px-4 py-3">
                  <div class="text-[10px] text-zinc-600 uppercase tracking-wider">Your posts</div>
                  <div class="text-lg font-bold mt-1">${postCount}</div>
                </div>
              </div>
            </div>
          </section>
          <div id="feed"></div>
        </div>
      </main>
    </div>
  `;
  bindShell();
  renderFeed();
  lucide.createIcons();
}

function bindShell() {
  $$(".nav-item[data-tab]").forEach(btn => btn.onclick = () => {
    state.tab = btn.dataset.tab;
    state.sidebarOpen = false;
    render();
  });
  $("#logout").onclick = () => {
    state.user = null;
    state.files = [];
    render();
  };
  $("#new-post")?.addEventListener("click", () => openPostModal());
  $("#admin-btn")?.addEventListener("click", openAdminModal);
  $("#open-sidebar")?.addEventListener("click", () => {
    $("#sidebar").classList.add("open");
    $("#mobile-overlay").classList.add("!block");
  });
  $("#close-sidebar")?.addEventListener("click", closeSidebar);
  $("#mobile-overlay")?.addEventListener("click", closeSidebar);
  $("#refresh")?.addEventListener("click", () => {
    render();
    toast("Feed refreshed.");
  });
  $("#search")?.addEventListener("input", e => {
    state.search = e.target.value;
    renderFeed();
    lucide.createIcons();
  });
  $("#search-mobile")?.addEventListener("click", () => {
    openModal(`
      <div class="modal glass rounded-[20px] p-5">
        <div class="flex items-center justify-between mb-4"><h3 class="font-bold">Search</h3><button class="btn btn-ghost icon-btn" data-close><i data-lucide="x"></i></button></div>
        <input id="modal-search" class="field" value="${esc(state.search)}" placeholder="Search titles, descriptions or files...">
      </div>
    `);
    $("#modal-search").oninput = e => { state.search = e.target.value; renderFeed(); };
    $("#modal-search").focus();
    lucide.createIcons();
  });
}

function closeSidebar() {
  $("#sidebar")?.classList.remove("open");
  $("#mobile-overlay")?.classList.remove("!block");
}

function filteredPosts() {
  const q = state.search.trim().toLowerCase();
  return DemoServer.state.posts
    .filter(p => p.space === state.tab)
    .filter(p => !q || [p.title, p.subtitle, p.description, ...(p.files || []).map(f => f.name)].join(" ").toLowerCase().includes(q))
    .sort((a,b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt);
}

function renderFeed() {
  const feed = $("#feed");
  if (!feed) return;
  const posts = filteredPosts();
  if (!posts.length) {
    feed.innerHTML = `
      <div class="glass rounded-[20px] empty">
        <div>
          <div class="w-12 h-12 rounded-[14px] bg-white/[.05] border border-white/[.07] grid place-items-center mx-auto mb-4"><i data-lucide="inbox" class="w-5 h-5 text-zinc-500"></i></div>
          <div class="font-semibold">Nothing here yet</div>
          <div class="text-sm text-zinc-600 mt-1">${canPost() ? "Create the first post for this space." : "Your teachers can add files and updates here."}</div>
          ${canPost() ? `<button class="btn btn-dark mt-4" id="empty-new"><i data-lucide="plus" class="w-4 h-4"></i>Create post</button>` : ""}
        </div>
      </div>
    `;
    $("#empty-new")?.addEventListener("click", () => openPostModal());
    lucide.createIcons();
    return;
  }
  feed.innerHTML = posts.map(postCard).join("");
  bindPostActions();
  lucide.createIcons();
  gsap.from(".post-card", { opacity: 0, y: 8, duration: .28, stagger: .035, ease: "power2.out" });
}


function relativeTime(timestamp) {
  const diff = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(timestamp).toLocaleDateString();
}

function postCard(post) {
  const author = DemoServer.state.users.find(u => u.id === post.authorId) || { displayName: "Unknown", username: "unknown", role: "student" };
  const liked = (post.likes || []).includes(currentUser().id);
  const desc = post.description || "No description provided.";
  return `
    <article class="post-card glass rounded-[20px] p-5 mb-4" data-post="${post.id}">
      <div class="flex gap-3">
        <div class="avatar w-10 h-10 text-xs">${esc(initials(author))}</div>
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-semibold">${esc(author.displayName)}</span>
            ${author.role === "owner" ? `<span class="badge owner">OWNER</span>` : author.role === "teacher" ? `<span class="badge teacher">TEACHER</span>` : ""}
            ${post.pinned ? `<span class="badge"><i data-lucide="pin" class="w-3 h-3"></i>Pinned</span>` : ""}
            ${post.highlighted ? `<span class="badge"><i data-lucide="sparkles" class="w-3 h-3"></i>Highlight</span>` : ""}
            <span class="text-[11px] text-zinc-600 ml-auto">${relativeTime(post.createdAt)}</span>
          </div>
          <div class="text-[11px] text-zinc-600">@${esc(author.username)} · ${esc(post.space)}</div>
        </div>
        ${author.id === currentUser().id || currentUser().role === "owner" ? `<button class="btn btn-ghost icon-btn post-menu" data-id="${post.id}"><i data-lucide="more-horizontal"></i></button>` : ""}
      </div>
      <div class="mt-5">
        ${post.title ? `<h2 class="post-title text-xl font-bold">${esc(post.title)}</h2>` : ""}
        ${post.subtitle ? `<div class="text-sm text-zinc-500 mt-1">${esc(post.subtitle)}</div>` : ""}
        <p class="text-sm leading-6 text-zinc-400 mt-3">${esc(desc.slice(0,30))}${desc.length > 30 ? "..." : ""}</p>
        <div class="mt-4 space-y-2">
          ${(post.files || []).map(f => `
            <div class="file-row">
              <div class="file-icon"><i data-lucide="${iconForFile(f.name)}" class="w-4 h-4 text-zinc-400"></i></div>
              <div class="min-w-0 flex-1">
                <div class="text-sm font-medium truncate">${esc(f.name)}</div>
                <div class="text-[11px] text-zinc-600 mt-0.5">${formatBytes(f.size)} · ${fileFormat(f.name)}</div>
              </div>
              <button class="btn btn-ghost icon-btn download-file" data-post="${post.id}" data-file="${esc(f.id)}" title="Download"><i data-lucide="download" class="w-4 h-4"></i></button>
            </div>
          `).join("")}
        </div>
        <div class="post-actions flex items-center gap-2 mt-5 pt-4 border-t border-white/[.06]">
          <button class="btn btn-ghost like-post ${liked ? "text-white" : "text-zinc-500"}" data-id="${post.id}"><i data-lucide="${liked ? "heart" : "heart"}" class="w-4 h-4 ${liked ? "fill-current" : ""}"></i>${(post.likes || []).length}</button>
          <button class="btn btn-ghost comment-post" data-id="${post.id}"><i data-lucide="message-square" class="w-4 h-4"></i>${(post.comments || []).length}</button>
          <button class="btn btn-ghost read-more ml-auto" data-id="${post.id}">Read more <i data-lucide="arrow-up-right" class="w-4 h-4"></i></button>
        </div>
      </div>
    </article>
  `;
}

function bindPostActions() {
  $$(".like-post").forEach(btn => btn.onclick = () => {
    const post = DemoServer.state.posts.find(p => p.id === btn.dataset.id);
    post.likes ||= [];
    const i = post.likes.indexOf(currentUser().id);
    i >= 0 ? post.likes.splice(i, 1) : post.likes.push(currentUser().id);
    DemoServer.save();
    renderFeed();
    lucide.createIcons();
  });
  $$(".comment-post").forEach(btn => btn.onclick = () => openPostModal(btn.dataset.id, true));
  $$(".read-more").forEach(btn => btn.onclick = () => openPostModal(btn.dataset.id, true));
  $$(".download-file").forEach(btn => btn.onclick = () => downloadFile(btn.dataset.post, btn.dataset.file));
  $$(".post-menu").forEach(btn => btn.onclick = () => openPostMenu(btn.dataset.id));
}

function openPostMenu(id) {
  const post = DemoServer.state.posts.find(p => p.id === id);
  const owner = currentUser().role === "owner";
  const teacher = ["teacher","owner"].includes(currentUser().role);
  openModal(`
    <div class="modal glass rounded-[20px] p-5">
      <div class="flex items-center justify-between mb-4"><div><h3 class="font-bold">Post actions</h3><p class="text-xs text-zinc-600 mt-1">${esc(post.title || "Untitled post")}</p></div><button class="btn btn-ghost icon-btn" data-close><i data-lucide="x"></i></button></div>
      <div class="grid gap-2">
        ${teacher ? `<button class="btn btn-ghost justify-start" data-action="pin"><i data-lucide="pin"></i>${post.pinned ? "Unpin" : "Pin"} post</button>` : ""}
        ${teacher ? `<button class="btn btn-ghost justify-start" data-action="highlight"><i data-lucide="sparkles"></i>${post.highlighted ? "Remove highlight" : "Highlight post"}</button>` : ""}
        ${teacher ? `<button class="btn btn-ghost justify-start" data-action="edit"><i data-lucide="pencil"></i>Edit post</button>` : ""}
        ${owner ? `<button class="btn btn-danger justify-start" data-action="delete"><i data-lucide="trash-2"></i>Delete post</button>` : ""}
      </div>
    </div>
  `);
  $$("[data-action]").forEach(b => b.onclick = () => {
    const action = b.dataset.action;
    if (action === "pin") post.pinned = !post.pinned;
    if (action === "highlight") post.highlighted = !post.highlighted;
    if (action === "edit") { closeModal(); openPostModal(id); return; }
    if (action === "delete") {
      DemoServer.state.posts = DemoServer.state.posts.filter(p => p.id !== id);
      toast("Post deleted.");
    }
    DemoServer.save();
    closeModal();
    renderFeed();
    lucide.createIcons();
  });
  lucide.createIcons();
}

function openPostModal(postId = null, detail = false) {
  const post = postId ? DemoServer.state.posts.find(p => p.id === postId) : null;
  if (detail && post) {
    const author = DemoServer.state.users.find(u => u.id === post.authorId) || {};
    openModal(`
      <div class="modal glass rounded-[20px] p-5 sm:p-6">
        <div class="flex items-start gap-3">
          <div class="avatar w-10 h-10 text-xs">${esc(initials(author))}</div>
          <div class="min-w-0 flex-1"><div class="font-semibold">${esc(author.displayName || "Unknown")}</div><div class="text-xs text-zinc-600">@${esc(author.username || "")} · ${esc(post.space)}</div></div>
          <button class="btn btn-ghost icon-btn" data-close><i data-lucide="x"></i></button>
        </div>
        <div class="mt-6">
          ${post.title ? `<h2 class="text-2xl font-bold tracking-tight">${esc(post.title)}</h2>` : ""}
          ${post.subtitle ? `<div class="text-sm text-zinc-500 mt-1">${esc(post.subtitle)}</div>` : ""}
          <p class="text-sm leading-7 text-zinc-300 mt-4 whitespace-pre-wrap">${esc(post.description || "No description provided.")}</p>
          <div class="mt-5 space-y-2">${(post.files || []).map(f => `<div class="file-row"><div class="file-icon"><i data-lucide="${iconForFile(f.name)}"></i></div><div class="min-w-0 flex-1"><div class="text-sm font-medium truncate">${esc(f.name)}</div><div class="text-[11px] text-zinc-600">${formatBytes(f.size)} · ${fileFormat(f.name)}</div></div><button class="btn btn-ghost icon-btn download-file" data-post="${post.id}" data-file="${esc(f.id)}"><i data-lucide="download"></i></button></div>`).join("")}</div>
          <div class="mt-6 pt-5 border-t border-white/[.06]">
            <div class="font-semibold text-sm">Comments</div>
            <div class="mt-3 space-y-3">${(post.comments || []).map(c => {
              const u = DemoServer.state.users.find(x => x.id === c.userId) || {};
              return `<div class="comment"><div class="flex items-center gap-2"><div class="avatar w-7 h-7 text-[9px]">${esc(initials(u))}</div><div class="text-xs font-semibold">${esc(u.displayName || "Unknown")}</div><div class="text-[10px] text-zinc-700">${new Date(c.createdAt).toLocaleString()}</div></div><div class="text-sm text-zinc-400 mt-2">${esc(c.text)}</div></div>`;
            }).join("") || `<div class="text-xs text-zinc-600">No comments yet.</div>`}</div>
            <form id="comment-form" class="flex gap-2 mt-4"><input class="field min-h-[46px]" name="text" maxlength="500" placeholder="Write a comment..." required><button class="btn btn-dark" type="submit">Send</button></form>
          </div>
        </div>
      </div>
    `);
    $("#comment-form").onsubmit = e => {
      e.preventDefault();
      const text = new FormData(e.currentTarget).get("text").toString().trim();
      if (!text) return;
      post.comments ||= [];
      post.comments.push({ id: uid("comment"), userId: currentUser().id, text, createdAt: Date.now() });
      DemoServer.save();
      closeModal();
      openPostModal(post.id, true);
      renderFeed();
    };
    $$(".download-file").forEach(b => b.onclick = () => downloadFile(b.dataset.post, b.dataset.file));
    lucide.createIcons();
    return;
  }

  if (!canPost()) return toast("Only teachers can create posts.", "error");
  state.files = post?.files ? [...post.files] : [];
  openModal(`
    <div class="modal glass rounded-[20px] p-5 sm:p-6">
      <div class="flex items-start justify-between gap-4">
        <div><div class="text-[10px] uppercase tracking-[.18em] text-zinc-600">${post ? "Edit post" : "New post"}</div><h3 class="text-xl font-bold mt-1">${post ? "Update your post" : "Share something with the class"}</h3></div>
        <button class="btn btn-ghost icon-btn" data-close><i data-lucide="x"></i></button>
      </div>
      <form id="post-form" class="mt-6 space-y-5">
        <div>
          <label class="text-xs text-zinc-400 block mb-2">Space</label>
          <select class="field select-field" name="space">
            ${tabs.map(t => `<option ${post?.space === t || (!post && t === state.tab) ? "selected" : ""}>${esc(t)}</option>`).join("")}
          </select>
        </div>
        <div class="grid sm:grid-cols-2 gap-4">
          <div><label class="text-xs text-zinc-400 block mb-2">Title <span class="text-zinc-700">(optional)</span></label><input class="field" name="title" maxlength="100" value="${esc(post?.title || "")}" placeholder="Post title"></div>
          <div><label class="text-xs text-zinc-400 block mb-2">Subtitle <span class="text-zinc-700">(optional)</span></label><input class="field" name="subtitle" maxlength="140" value="${esc(post?.subtitle || "")}" placeholder="A short subtitle"></div>
        </div>
        <div><label class="text-xs text-zinc-400 block mb-2">Description <span class="text-zinc-700">(optional)</span></label><textarea class="field" name="description" maxlength="2000" placeholder="Tell everyone what these files are for...">${esc(post?.description || "")}</textarea></div>
        <div>
          <label class="text-xs text-zinc-400 block mb-2">Files <span class="text-zinc-700">(up to 5)</span></label>
          <div class="dropzone p-4 grid place-items-center text-center" id="dropzone">
            <input id="file-input" class="hidden-file" type="file" multiple>
            <button type="button" class="btn btn-ghost" id="choose-files"><i data-lucide="upload"></i>Choose files</button>
            <div class="text-xs text-zinc-600 mt-2">Any file type · maximum 5 files</div>
          </div>
          <div id="file-list" class="space-y-2 mt-3"></div>
        </div>
        <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
          <button type="button" class="btn btn-ghost" data-close>Cancel</button>
          <button type="submit" class="btn btn-dark">${post ? "Save changes" : "Publish post"} <i data-lucide="${post ? "save" : "send"}"></i></button>
        </div>
      </form>
    </div>
  `);
  renderSelectedFiles();
  $("#choose-files").onclick = () => $("#file-input").click();
  $("#file-input").onchange = e => addFiles([...e.target.files]);
  const dz = $("#dropzone");
  ["dragenter","dragover"].forEach(type => dz.addEventListener(type, e => { e.preventDefault(); dz.classList.add("drag"); }));
  ["dragleave","drop"].forEach(type => dz.addEventListener(type, e => { e.preventDefault(); dz.classList.remove("drag"); }));
  dz.addEventListener("drop", e => addFiles([...e.dataTransfer.files]));
  $("#post-form").onsubmit = e => savePost(e, post?.id);
  lucide.createIcons();
}

function addFiles(files) {
  const remaining = 5 - state.files.length;
  if (remaining <= 0) return toast("You can attach up to 5 files.", "error");
  files.slice(0, remaining).forEach(file => {
    const reader = new FileReader();
    reader.onload = () => {
      state.files.push({ id: uid("file"), name: file.name, size: file.size, type: file.type || "application/octet-stream", data: reader.result });
      renderSelectedFiles();
    };
    reader.readAsDataURL(file);
  });
  if (files.length > remaining) toast("Only the first available slots were added.");
}

function renderSelectedFiles() {
  const root = $("#file-list");
  if (!root) return;
  root.innerHTML = state.files.length ? state.files.map(f => `
    <div class="file-chip">
      <i data-lucide="${iconForFile(f.name)}" class="w-4 h-4 text-zinc-500"></i>
      <div class="min-w-0 flex-1"><div class="text-xs font-medium truncate">${esc(f.name)}</div><div class="text-[10px] text-zinc-600">${formatBytes(f.size)}</div></div>
      <button type="button" class="btn btn-ghost icon-btn remove-file" data-id="${f.id}"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>
    </div>
  `).join("") : `<div class="text-xs text-zinc-700 text-center py-2">No files selected.</div>`;
  $$(".remove-file").forEach(b => b.onclick = () => {
    state.files = state.files.filter(f => f.id !== b.dataset.id);
    renderSelectedFiles();
  });
  lucide.createIcons();
}

function savePost(e, id) {
  e.preventDefault();
  const form = new FormData(e.currentTarget);
  let post = id ? DemoServer.state.posts.find(p => p.id === id) : null;
  if (!post) {
    post = {
      id: uid("post"),
      authorId: currentUser().id,
      createdAt: Date.now(),
      likes: [],
      comments: [],
      pinned: false,
      highlighted: false
    };
    DemoServer.state.posts.push(post);
  }
  post.space = String(form.get("space"));
  post.title = String(form.get("title")).trim();
  post.subtitle = String(form.get("subtitle")).trim();
  post.description = String(form.get("description")).trim();
  post.files = [...state.files];
  DemoServer.save();
  state.tab = post.space;
  state.files = [];
  closeModal();
  render();
  toast(id ? "Post updated." : "Post published.");
}

function downloadFile(postId, fileId) {
  const post = DemoServer.state.posts.find(p => p.id === postId);
  const file = post?.files?.find(f => f.id === fileId);
  if (!file?.data) return toast("This file has no downloadable data in demo mode.", "error");
  const a = document.createElement("a");
  a.href = file.data;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function openModal(html) {
  modalRoot.innerHTML = `<div class="fixed inset-0 z-[100] overlay grid place-items-center p-3" id="modal-backdrop">${html}</div>`;
  $("#modal-backdrop").addEventListener("click", e => { if (e.target.id === "modal-backdrop") closeModal(); });
  $("[data-close]")?.addEventListener("click", closeModal);
  lucide.createIcons();
  gsap.from(".modal", { opacity: 0, y: 12, scale: .985, duration: .22, ease: "power2.out" });
}

function closeModal() {
  modalRoot.innerHTML = "";
  state.files = [];
}

function openAdminModal() {
  if (currentUser().role !== "owner") return;
  const users = DemoServer.state.users;
  openModal(`
    <div class="modal glass rounded-[20px] p-5 sm:p-6">
      <div class="flex items-start justify-between gap-4">
        <div><div class="text-[10px] uppercase tracking-[.18em] text-zinc-600">Administration</div><h3 class="text-xl font-bold mt-1">Owner panel</h3></div>
        <button class="btn btn-ghost icon-btn" data-close><i data-lucide="x"></i></button>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-5">
        <div class="glass-soft rounded-[13px] p-3"><div class="text-[10px] text-zinc-600">Accounts</div><div class="font-bold mt-1">${users.length}</div></div>
        <div class="glass-soft rounded-[13px] p-3"><div class="text-[10px] text-zinc-600">Teachers</div><div class="font-bold mt-1">${users.filter(u=>u.role==="teacher").length}</div></div>
        <div class="glass-soft rounded-[13px] p-3"><div class="text-[10px] text-zinc-600">Students</div><div class="font-bold mt-1">${users.filter(u=>u.role==="student").length}</div></div>
        <div class="glass-soft rounded-[13px] p-3"><div class="text-[10px] text-zinc-600">Posts</div><div class="font-bold mt-1">${DemoServer.state.posts.length}</div></div>
      </div>
      <div class="mt-6">
        <div class="flex items-center justify-between mb-2"><div class="font-semibold text-sm">Accounts</div><div class="text-[11px] text-zinc-600">Teacher / student / moderation</div></div>
        <div class="table-wrap">
          <table><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>
            ${users.map(u => `
              <tr>
                <td><div class="font-medium">${esc(u.displayName)}</div><div class="text-[10px] text-zinc-600">@${esc(u.username)}</div></td>
                <td><select class="field role-select min-h-[38px] py-2 px-2 text-xs" data-id="${u.id}" ${u.role==="owner" ? "disabled" : ""}><option value="student" ${u.role==="student"?"selected":""}>Student</option><option value="teacher" ${u.role==="teacher"?"selected":""}>Teacher</option></select></td>
                <td>${u.banned ? `<span class="badge">BANNED</span>` : u.muted ? `<span class="badge">MUTED</span>` : `<span class="badge">ACTIVE</span>`}</td>
                <td><div class="flex gap-1">
                  ${u.role!=="owner" ? `<button class="btn btn-ghost h-9 px-2 text-xs toggle-ban" data-id="${u.id}">${u.banned?"Unban":"Ban"}</button><button class="btn btn-ghost h-9 px-2 text-xs toggle-mute" data-id="${u.id}">${u.muted?"Unmute":"Mute"}</button>` : `<span class="text-[10px] text-zinc-700 px-2">Protected</span>`}
                </div></td>
              </tr>
            `).join("")}
          </tbody></table>
        </div>
      </div>
      <div class="mt-6 pt-5 border-t border-white/[.06]">
        <div class="font-semibold text-sm">JSONBin sync</div>
        <p class="text-xs text-zinc-600 mt-1">For this frontend test, the key is entered only in this browser session. Do not put a master key into public GitHub code.</p>
        <div class="flex flex-col sm:flex-row gap-2 mt-3"><input id="jsonbin-key" class="field" type="password" placeholder="Paste JSONBin key for this session"><button class="btn btn-ghost" id="save-key">Use key</button></div>
        <div class="flex flex-col sm:flex-row gap-2 mt-2"><button class="btn btn-ghost" id="pull-bin"><i data-lucide="cloud-download"></i>Pull from JSONBin</button><button class="btn btn-ghost" id="push-bin"><i data-lucide="cloud-upload"></i>Push to JSONBin</button><button class="btn btn-danger" id="reset-demo"><i data-lucide="rotate-ccw"></i>Reset demo</button></div>
        <div class="text-[10px] text-zinc-700 mt-3">Bin: ${APP_CONFIG.binId}</div>
      </div>
    </div>
  `);
  $$(".role-select").forEach(s => s.onchange = () => {
    const u = DemoServer.state.users.find(x => x.id === s.dataset.id);
    if (u) { u.role = s.value; DemoServer.save(); toast(`${u.displayName} is now ${u.role}.`); }
  });
  $$(".toggle-ban").forEach(b => b.onclick = () => {
    const u = DemoServer.state.users.find(x => x.id === b.dataset.id);
    u.banned = !u.banned; DemoServer.save(); openAdminModal(); toast(u.banned ? "Account banned." : "Account unbanned.");
  });
  $$(".toggle-mute").forEach(b => b.onclick = () => {
    const u = DemoServer.state.users.find(x => x.id === b.dataset.id);
    u.muted = !u.muted; DemoServer.save(); openAdminModal(); toast(u.muted ? "Account muted." : "Account unmuted.");
  });
  $("#save-key").onclick = () => { DemoServer.setJsonBinKey($("#jsonbin-key").value); toast("JSONBin key saved for this session."); };
  $("#pull-bin").onclick = async () => {
    try { await DemoServer.pullFromJsonBin(); closeModal(); render(); toast("Loaded data from JSONBin."); } catch (e) { toast(e.message, "error"); }
  };
  $("#push-bin").onclick = async () => {
    try { await DemoServer.pushToJsonBin(); toast("Data pushed to JSONBin."); } catch (e) { toast(e.message, "error"); }
  };
  $("#reset-demo").onclick = () => {
    if (!confirm("Reset all local ClassShare demo data?")) return;
    DemoServer.reset();
    closeModal();
    state.user = null;
    render();
    toast("Demo reset.");
  };
  lucide.createIcons();
}

seedOwnerIfNeeded();

window.ClassShare = {
  config: APP_CONFIG,
  server: DemoServer,
  state
};
