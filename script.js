const state = {
  user: null,
  section: "General",
  posts: [],
  users: []
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function icon(name) {
  return `<i data-lucide="${name}"></i>`;
}

function renderIcons() {
  if (window.lucide) lucide.createIcons();
}

function escapeHtml(value = "") {
  return DOMPurify.sanitize(String(value), {ALLOWED_TAGS: [], ALLOWED_ATTR: []});
}

function formatSize(bytes) {
  if (!Number.isFinite(bytes)) return "Unknown size";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function fileIcon(name = "") {
  const ext = name.split(".").pop().toLowerCase();
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext)) return "image";
  if (["mp4", "webm", "mov", "avi", "mkv"].includes(ext)) return "video";
  if (["mp3", "wav", "ogg", "flac", "m4a"].includes(ext)) return "music";
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return "archive";
  if (["pdf"].includes(ext)) return "file-text";
  if (["doc", "docx", "odt", "rtf"].includes(ext)) return "file-text";
  if (["xls", "xlsx", "csv", "ods"].includes(ext)) return "table-2";
  if (["ppt", "pptx", "odp"].includes(ext)) return "presentation";
  if (["js", "ts", "html", "css", "json", "py", "lua", "java", "cpp", "c", "cs"].includes(ext)) return "code-2";
  return "file";
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  $("#toast-root").appendChild(toast);
  gsap.fromTo(toast, {y: 20, opacity: 0}, {y: 0, opacity: 1, duration: .25});
  setTimeout(() => {
    gsap.to(toast, {y: 10, opacity: 0, duration: .2, onComplete: () => toast.remove()});
  }, 2600);
}

async function api(url, options = {}) {
  const token = localStorage.getItem("classdrop_token");
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? {"Authorization": `Bearer ${token}`} : {}),
      ...(options.headers || {})
    }
  });

  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(data.error || "Something went wrong");
  }

  return data;
}

function setAuthMode(mode) {
  $$(".auth-tab").forEach(tab => tab.classList.toggle("active", tab.dataset.auth === mode));
  $("#login-form").classList.toggle("hidden", mode !== "login");
  $("#signup-form").classList.toggle("hidden", mode !== "signup");
}

function showApp() {
  $("#auth-view").classList.add("hidden");
  $("#app-view").classList.remove("hidden");
  updateProfile();
  renderIcons();
  gsap.from("#app-view", {opacity: 0, duration: .35});
}

function updateProfile() {
  if (!state.user) return;
  $("#profile-name").textContent = state.user.displayName;
  $("#profile-role").textContent = state.user.role;
  $("#profile-avatar").textContent = state.user.displayName.slice(0, 1).toUpperCase();
  $("#teacher-tools").classList.toggle("hidden", !["teacher", "owner"].includes(state.user.role));
  $("#owner-tools").classList.toggle("hidden", state.user.role !== "owner");
}

async function login(username, password) {
  const data = await api("/api/login", {
    method: "POST",
    body: JSON.stringify({username, password})
  });
  state.user = data.user;
  localStorage.setItem("classdrop_session", JSON.stringify(state.user));
  localStorage.setItem("classdrop_token", data.token);
  showApp();
  await loadSection(state.section);
}

async function signup(displayName, username, password) {
  const data = await api("/api/signup", {
    method: "POST",
    body: JSON.stringify({displayName, username, password})
  });
  state.user = data.user;
  localStorage.setItem("classdrop_session", JSON.stringify(state.user));
  localStorage.setItem("classdrop_token", data.token);
  showApp();
  await loadSection(state.section);
}

async function restoreSession() {
  const token = localStorage.getItem("classdrop_token");
  if (!token) return;
  try {
    const data = await api("/api/session", {method: "POST", body: JSON.stringify({})});
    state.user = data.user;
    localStorage.setItem("classdrop_session", JSON.stringify(state.user));
    showApp();
    await loadSection(state.section);
  } catch {
    localStorage.removeItem("classdrop_session");
    localStorage.removeItem("classdrop_token");
  }
}

async function loadSection(section) {
  state.section = section;
  $("#section-title").textContent = section;
  $("#feed-title").textContent = section;
  $$(".nav-item[data-section]").forEach(item => item.classList.toggle("active", item.dataset.section === section));
  $("#owner-view").classList.add("hidden");
  $("#feed-view").classList.remove("hidden");

  try {
    const data = await api(`/api/posts?section=${encodeURIComponent(section)}`);
    state.posts = data.posts || [];
    renderPosts();
  } catch (error) {
    showToast(error.message);
  }
}

function renderPosts() {
  const posts = [...state.posts].sort((a, b) => {
    if (a.pinned !== b.pinned) return Number(b.pinned) - Number(a.pinned);
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  $("#posts").innerHTML = posts.map(renderPost).join("");
  $("#empty-state").classList.toggle("hidden", posts.length !== 0);
  $("#feed-count").textContent = `${posts.length} ${posts.length === 1 ? "post" : "posts"}`;
  renderIcons();
  gsap.from(".post", {opacity: 0, y: 10, duration: .25, stagger: .035});
}

function renderPost(post) {
  const description = post.description || "";
  const preview = description.length > 30 ? `${description.slice(0, 30)}...` : description;
  const liked = (post.likes || []).includes(state.user.id);
  const files = (post.files || []).map(file => `
    <div class="file-row">
      <div class="file-icon">${icon(fileIcon(file.name))}</div>
      <div class="file-info">
        <div class="file-name">${escapeHtml(file.name)}</div>
        <div class="file-meta">${formatSize(file.size)} · ${escapeHtml(file.extension || "file")}</div>
      </div>
      <button class="file-download" data-download="${escapeHtml(file.id)}" title="Download">${icon("download")}</button>
    </div>
  `).join("");

  return `
    <article class="post ${post.highlighted ? "highlight" : ""}" data-post="${post.id}">
      ${post.pinned ? `<div class="pin-mark">${icon("pin")}</div>` : ""}
      <div class="post-meta">
        <span>${escapeHtml(post.authorName)}</span>
        <span class="dot"></span>
        <span>${escapeHtml(post.section)}</span>
        <span class="dot"></span>
        <span>${new Date(post.createdAt).toLocaleString()}</span>
      </div>
      ${post.title ? `<h3 class="post-title">${escapeHtml(post.title)}</h3>` : ""}
      ${post.subtitle ? `<div class="post-subtitle">${escapeHtml(post.subtitle)}</div>` : ""}
      ${preview ? `<div class="post-description">${escapeHtml(preview)}</div>` : ""}
      <div class="file-list">${files}</div>
      <div class="post-actions">
        <div class="action-group">
          <button class="action-btn ${liked ? "liked" : ""}" data-like="${post.id}">${icon(liked ? "heart" : "heart")}<span>${(post.likes || []).length}</span></button>
          <button class="action-btn" data-open="${post.id}">${icon("message-circle")}<span>${(post.comments || []).length}</span></button>
        </div>
        <button class="read-btn" data-open="${post.id}">Read More ${icon("arrow-up-right")}</button>
      </div>
    </article>
  `;
}

async function toggleLike(postId) {
  try {
    const data = await api(`/api/posts/${postId}/like`, {method: "POST", body: JSON.stringify({})});
    const post = state.posts.find(item => item.id === postId);
    if (post) post.likes = data.likes;
    renderPosts();
  } catch (error) {
    showToast(error.message);
  }
}

async function openPost(postId) {
  try {
    const data = await api(`/api/posts/${postId}`);
    const post = data.post;
    $("#detail-title").textContent = post.title || "Untitled post";
    const comments = (post.comments || []).map(comment => `
      <div class="comment">
        <div class="comment-author">${escapeHtml(comment.authorName)}</div>
        <div class="comment-text">${escapeHtml(comment.text)}</div>
      </div>
    `).join("");

    const files = (post.files || []).map(file => `
      <div class="file-row">
        <div class="file-icon">${icon(fileIcon(file.name))}</div>
        <div class="file-info">
          <div class="file-name">${escapeHtml(file.name)}</div>
          <div class="file-meta">${formatSize(file.size)} · ${escapeHtml(file.extension || "file")}</div>
        </div>
        <button class="file-download" data-download="${escapeHtml(file.id)}">${icon("download")}</button>
      </div>
    `).join("");

    $("#post-detail").innerHTML = `
      <div class="post-meta">
        <span>${escapeHtml(post.authorName)}</span><span class="dot"></span><span>${escapeHtml(post.section)}</span>
      </div>
      ${post.subtitle ? `<div class="post-subtitle">${escapeHtml(post.subtitle)}</div>` : ""}
      <div class="detail-body">${escapeHtml(post.description || "No description.")}</div>
      <div class="detail-files">${files}</div>
      <div class="comments">
        <h3>Comments</h3>
        ${comments || `<div class="comment-text">No comments yet.</div>`}
        <form class="comment-form" id="comment-form">
          <input id="comment-input" maxlength="500" placeholder="Write a comment..." required>
          <button class="primary-btn" type="submit">${icon("send")}</button>
        </form>
      </div>
    `;
    $("#post-detail-modal").classList.remove("hidden");
    $("#post-detail-modal").dataset.post = post.id;
    renderIcons();
    gsap.from("#post-detail-modal .modal-card", {y: 18, opacity: 0, duration: .25});
  } catch (error) {
    showToast(error.message);
  }
}

async function submitComment(postId, text) {
  try {
    await api(`/api/posts/${postId}/comments`, {
      method: "POST",
      body: JSON.stringify({text})
    });
    await openPost(postId);
    await loadSection(state.section);
  } catch (error) {
    showToast(error.message);
  }
}

async function createPost() {
  const files = [...$("#post-files").files];
  if (files.length > 5) {
    showToast("You can upload up to 5 files.");
    return;
  }

  const encodedFiles = [];
  for (const file of files) {
    encodedFiles.push(await readFile(file));
  }

  const payload = {
    title: $("#post-title").value.trim(),
    subtitle: $("#post-subtitle").value.trim(),
    description: $("#post-description").value.trim(),
    section: $("#post-section").value,
    pinned: $("#post-pin").checked,
    highlighted: $("#post-highlight").checked,
    notify: $("#post-notify").checked,
    files: encodedFiles
  };

  const button = $("#post-form button[type=submit]");
  button.disabled = true;

  try {
    await api("/api/posts", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    $("#post-form").reset();
    $("#file-preview").innerHTML = "";
    closeModals();
    state.section = payload.section;
    await loadSection(state.section);
    showToast("Post published.");
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size,
      data: reader.result
    });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function downloadFile(fileId) {
  window.open(`/api/files/${encodeURIComponent(fileId)}`, "_blank");
}

async function loadOwnerPanel() {
  if (state.user.role !== "owner") return;
  try {
    const data = await api("/api/admin/users");
    state.users = data.users;
    $("#feed-view").classList.add("hidden");
    $("#owner-view").classList.remove("hidden");
    $("#section-title").textContent = "Owner panel";
    $("#section-kicker").textContent = "Administration";
    $("#accounts").innerHTML = state.users.map(user => `
      <div class="account">
        <div>
          <div class="account-name">${escapeHtml(user.displayName)} · @${escapeHtml(user.username)}</div>
          <div class="account-info">${escapeHtml(user.role)} · ${escapeHtml(user.status)} · ${new Date(user.createdAt).toLocaleDateString()}</div>
        </div>
        <div class="account-actions">
          ${user.username === "WVOwner" ? `<span class="count-pill">Owner</span>` : `
            <select data-role="${user.id}">
              <option value="student" ${user.role === "student" ? "selected" : ""}>Student</option>
              <option value="teacher" ${user.role === "teacher" ? "selected" : ""}>Teacher</option>
            </select>
            <button class="neutral-btn" data-mute="${user.id}">${user.status === "muted" ? "Unmute" : "Mute"}</button>
            <button class="danger-btn" data-ban="${user.id}">${user.status === "banned" ? "Unban" : "Ban"}</button>
          `}
        </div>
      </div>
    `).join("");
    renderIcons();
  } catch (error) {
    showToast(error.message);
  }
}

async function changeRole(userId, role) {
  try {
    await api(`/api/admin/users/${userId}/role`, {
      method: "POST",
      body: JSON.stringify({role})
    });
    showToast("Role updated.");
    loadOwnerPanel();
  } catch (error) {
    showToast(error.message);
  }
}

async function changeStatus(userId, action) {
  try {
    await api(`/api/admin/users/${userId}/status`, {
      method: "POST",
      body: JSON.stringify({action})
    });
    showToast("Account updated.");
    loadOwnerPanel();
  } catch (error) {
    showToast(error.message);
  }
}

function openProfile() {
  $("#profile-modal-name").textContent = state.user.displayName;
  $("#profile-modal-body").innerHTML = `
    <div class="profile-details">
      <div class="profile-detail"><span>Username</span><span>@${escapeHtml(state.user.username)}</span></div>
      <div class="profile-detail"><span>Role</span><span>${escapeHtml(state.user.role)}</span></div>
      <div class="profile-detail"><span>Status</span><span>${escapeHtml(state.user.status)}</span></div>
    </div>
  `;
  $("#profile-modal").classList.remove("hidden");
}

function closeModals() {
  $$(".modal").forEach(modal => modal.classList.add("hidden"));
}

function logout() {
  localStorage.removeItem("classdrop_session");
  localStorage.removeItem("classdrop_token");
  location.reload();
}

$("#login-form").addEventListener("submit", async event => {
  event.preventDefault();
  try {
    await login($("#login-username").value.trim(), $("#login-password").value);
  } catch (error) {
    showToast(error.message);
  }
});

$("#signup-form").addEventListener("submit", async event => {
  event.preventDefault();
  try {
    await signup($("#signup-name").value.trim(), $("#signup-username").value.trim(), $("#signup-password").value);
  } catch (error) {
    showToast(error.message);
  }
});

$$(".auth-tab").forEach(tab => tab.addEventListener("click", () => setAuthMode(tab.dataset.auth)));

$$(".nav-item[data-section]").forEach(item => {
  item.addEventListener("click", () => {
    $("#sidebar").classList.remove("open");
    loadSection(item.dataset.section);
  });
});

$("#open-menu").addEventListener("click", () => $("#sidebar").classList.add("open"));
$("#close-menu").addEventListener("click", () => $("#sidebar").classList.remove("open"));
$("#refresh-btn").addEventListener("click", () => loadSection(state.section));
$("#logout-btn").addEventListener("click", logout);
$("#profile-btn").addEventListener("click", openProfile);
$("#new-post-btn").addEventListener("click", () => {
  $("#post-section").value = state.section;
  $("#post-modal").classList.remove("hidden");
  gsap.from("#post-modal .modal-card", {y: 18, opacity: 0, duration: .25});
});
$("#owner-panel-btn").addEventListener("click", loadOwnerPanel);

$$(".close-modal").forEach(button => button.addEventListener("click", closeModals));

document.addEventListener("click", event => {
  const like = event.target.closest("[data-like]");
  const open = event.target.closest("[data-open]");
  const download = event.target.closest("[data-download]");
  const role = event.target.closest("[data-role]");
  const mute = event.target.closest("[data-mute]");
  const ban = event.target.closest("[data-ban]");

  if (like) toggleLike(like.dataset.like);
  if (open) openPost(open.dataset.open);
  if (download) downloadFile(download.dataset.download);
  if (role) changeRole(role.dataset.role, role.value);
  if (mute) changeStatus(mute.dataset.mute, "toggle-mute");
  if (ban) changeStatus(ban.dataset.ban, "toggle-ban");
});

$("#post-form").addEventListener("submit", event => {
  event.preventDefault();
  createPost();
});

$("#post-files").addEventListener("change", () => {
  const files = [...$("#post-files").files];
  $("#file-preview").innerHTML = files.slice(0, 5).map(file =>
    `<div class="preview-item">${escapeHtml(file.name)} · ${formatSize(file.size)}</div>`
  ).join("");
  if (files.length > 5) showToast("Only the first 5 files will be accepted.");
});

$("#post-detail").addEventListener("submit", event => {
  if (event.target.id !== "comment-form") return;
  event.preventDefault();
  const postId = $("#post-detail-modal").dataset.post;
  const input = $("#comment-input");
  submitComment(postId, input.value.trim());
});

restoreSession();
renderIcons();
