const state = {
    database: null,
    currentUser: null,
    currentSection: "General",
    selectedFiles: []
};

const OWNER_USERNAME = "WVOwner";
const OWNER_PASSWORD = "WVOwnr-MEGAGEGA-6767-BRRBRRPAT-UTAKUSPAKUYTUALETIKI-PISYUNPIPIPOPO-PALABUBIKBLIY";

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

document.addEventListener("DOMContentLoaded", init);

async function init() {
    lucide.createIcons();

    try {
        state.database = await ClassDropServer.getDatabase();
        await ensureOwner();
        state.database = await ClassDropServer.getDatabase();

        const savedUser = localStorage.getItem("classdrop_user");

        if (savedUser) {
            const user = state.database.users.find(item => item.id === savedUser);

            if (user && user.status !== "banned") {
                state.currentUser = user;
                showApp();
            } else {
                localStorage.removeItem("classdrop_user");
                showAuth();
            }
        } else {
            showAuth();
        }
    } catch (error) {
        console.error(error);
        showAuth();
        toast(error.message || "Could not connect to JSONBin.");
    }

    bindEvents();
}

async function ensureOwner() {
    const existing = state.database.users.find(
        user => user.username.toLowerCase() === OWNER_USERNAME.toLowerCase()
    );

    if (existing) {
        return;
    }

    const owner = {
        id: createId(),
        username: OWNER_USERNAME,
        displayName: "WVOwner",
        password: await hashPassword(OWNER_PASSWORD),
        role: "owner",
        status: "active",
        createdAt: new Date().toISOString()
    };

    state.database.users.push(owner);
    await ClassDropServer.saveDatabase(state.database);
}

function bindEvents() {
    $$(".auth-tab").forEach(button => {
        button.addEventListener("click", () => {
            $$(".auth-tab").forEach(item => item.classList.remove("active"));
            button.classList.add("active");

            const mode = button.dataset.auth;

            $("#loginForm").classList.toggle("hidden", mode !== "login");
            $("#signupForm").classList.toggle("hidden", mode !== "signup");

            gsap.fromTo(
                mode === "login" ? "#loginForm" : "#signupForm",
                { opacity: 0, y: 8 },
                { opacity: 1, y: 0, duration: .25 }
            );
        });
    });

    $("#loginForm").addEventListener("submit", login);
    $("#signupForm").addEventListener("submit", signup);
    $("#logoutButton").addEventListener("click", logout);
    $("#refreshButton").addEventListener("click", refresh);
    $("#notificationButton").addEventListener("click", toggleNotifications);
    $("#clearNotifications").addEventListener("click", clearNotifications);
    $("#createPostButton").addEventListener("click", () => openModal("#composerModal"));
    $("#openAdmin").addEventListener("click", openAdmin);
    $("#openMenu").addEventListener("click", () => $("#sidebar").classList.add("open"));
    $("#closeMenu").addEventListener("click", () => $("#sidebar").classList.remove("open"));

    $$(".nav-item[data-section]").forEach(button => {
        button.addEventListener("click", () => {
            state.currentSection = button.dataset.section;

            $$(".nav-item[data-section]").forEach(item => item.classList.remove("active"));
            button.classList.add("active");

            $("#sectionTitle").textContent = state.currentSection;
            $("#sidebar").classList.remove("open");

            renderFeed();
        });
    });

    $$(".close-modal").forEach(button => {
        button.addEventListener("click", closeModals);
    });

    $$(".modal-backdrop").forEach(backdrop => {
        backdrop.addEventListener("click", closeModals);
    });

    $("#postFiles").addEventListener("change", handleFiles);
    $("#postForm").addEventListener("submit", createPost);

    $("#feed").addEventListener("click", handleFeedClick);
    $("#postModalContent").addEventListener("click", handlePostModalClick);
    $("#accountsList").addEventListener("click", handleAccountClick);

    window.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            closeModals();
            $("#notificationsPanel").classList.add("hidden");
        }
    });
}

async function login(event) {
    event.preventDefault();

    const username = $("#loginUsername").value.trim();
    const password = $("#loginPassword").value;

    if (!username || !password) {
        toast("Enter your username and password.");
        return;
    }

    try {
        state.database = await ClassDropServer.getDatabase();

        const user = state.database.users.find(
            item => item.username.toLowerCase() === username.toLowerCase()
        );

        if (!user) {
            toast("Account not found.");
            return;
        }

        if (user.status === "banned") {
            toast("This account is banned.");
            return;
        }

        if (user.status === "muted") {
            toast("You are muted. You can still log in.");
        }

        const passwordHash = await hashPassword(password);

        if (passwordHash !== user.password) {
            toast("Incorrect password.");
            return;
        }

        state.currentUser = user;
        localStorage.setItem("classdrop_user", user.id);

        showApp();
        toast(`Welcome back, ${user.displayName}.`);
    } catch (error) {
        toast(error.message);
    }
}

async function signup(event) {
    event.preventDefault();

    const displayName = $("#signupDisplayName").value.trim();
    const username = $("#signupUsername").value.trim();
    const password = $("#signupPassword").value;

    if (displayName.length < 2) {
        toast("Enter a valid display name.");
        return;
    }

    if (!/^[a-zA-Z0-9._-]{3,24}$/.test(username)) {
        toast("Username must be 3–24 characters and use letters, numbers, ., _ or -.");
        return;
    }

    if (password.length < 6) {
        toast("Password must be at least 6 characters.");
        return;
    }

    if (username.toLowerCase() === OWNER_USERNAME.toLowerCase()) {
        toast("That username is reserved.");
        return;
    }

    try {
        state.database = await ClassDropServer.getDatabase();

        const exists = state.database.users.some(
            user => user.username.toLowerCase() === username.toLowerCase()
        );

        if (exists) {
            toast("That username already exists.");
            return;
        }

        const user = {
            id: createId(),
            username,
            displayName,
            password: await hashPassword(password),
            role: "student",
            status: "active",
            createdAt: new Date().toISOString()
        };

        state.database.users.push(user);

        await ClassDropServer.saveDatabase(state.database);

        state.currentUser = user;
        localStorage.setItem("classdrop_user", user.id);

        showApp();
        toast("Account created.");
    } catch (error) {
        toast(error.message);
    }
}

function showAuth() {
    $("#loadingScreen").classList.add("hidden");
    $("#authScreen").classList.remove("hidden");
    $("#app").classList.add("hidden");

    gsap.fromTo(
        "#authScreen .auth-shell",
        { opacity: 0, y: 18 },
        { opacity: 1, y: 0, duration: .5, ease: "power2.out" }
    );
}

function showApp() {
    $("#loadingScreen").classList.add("hidden");
    $("#authScreen").classList.add("hidden");
    $("#app").classList.remove("hidden");

    updateAccountUI();
    renderFeed();
    updateNotifications();

    gsap.fromTo(
        "#app",
        { opacity: 0 },
        { opacity: 1, duration: .4 }
    );
}

function updateAccountUI() {
    if (!state.currentUser) {
        return;
    }

    const user = state.currentUser;

    $("#accountName").textContent = user.displayName;
    $("#accountRole").textContent = roleLabel(user.role);
    $("#accountAvatar").textContent = initials(user.displayName);
    $("#welcomeText").textContent = `Welcome, ${user.displayName}.`;

    const canPost = ["teacher", "owner"].includes(user.role);
    const isOwner = user.role === "owner";

    $("#createPostButton").classList.toggle("hidden", !canPost);
    $("#ownerLink").classList.toggle("hidden", !isOwner);
}

function renderFeed() {
    if (!state.database) {
        return;
    }

    const posts = state.database.posts
        .filter(post => post.section === state.currentSection)
        .sort((a, b) => {
            if (a.pinned !== b.pinned) {
                return a.pinned ? -1 : 1;
            }

            return new Date(b.createdAt) - new Date(a.createdAt);
        });

    $("#feed").innerHTML = "";
    $("#emptyState").classList.toggle("hidden", posts.length > 0);

    posts.forEach(post => {
        $("#feed").appendChild(createPostCard(post));
    });

    lucide.createIcons();

    gsap.fromTo(
        ".post-card",
        { opacity: 0, y: 12 },
        {
            opacity: 1,
            y: 0,
            duration: .35,
            stagger: .04,
            ease: "power2.out"
        }
    );
}

function createPostCard(post) {
    const author = findUser(post.authorId);
    const liked = post.likes?.includes(state.currentUser.id);

    const card = document.createElement("article");
    card.className = `post-card glass ${post.pinned ? "pinned" : ""} ${post.highlighted ? "highlighted" : ""}`;
    card.dataset.id = post.id;

    const description = post.description || "No description provided.";
    const shortDescription = description.length > 30
        ? `${description.slice(0, 30)}...`
        : description;

    card.innerHTML = `
        <div class="post-meta">
            <div class="author">
                <div class="author-avatar">${escapeHTML(initials(author?.displayName || "U"))}</div>
                <div>
                    <div class="author-name">${escapeHTML(author?.displayName || "Unknown user")}</div>
                    <div class="author-role">${escapeHTML(roleLabel(author?.role || "student"))}</div>
                </div>
            </div>

            <div class="post-time">${timeAgo(post.createdAt)}</div>
        </div>

        ${post.title ? `<h3 class="post-title">${escapeHTML(post.title)}</h3>` : ""}
        ${post.subtitle ? `<div class="post-subtitle">${escapeHTML(post.subtitle)}</div>` : ""}
        <div class="post-description">${escapeHTML(shortDescription)}</div>

        ${renderFiles(post.files || [])}

        <div class="post-footer">
            <div class="post-actions">
                <button class="action-button ${liked ? "liked" : ""}" data-action="like" data-id="${post.id}">
                    <i data-lucide="heart"></i>
                    ${post.likes?.length || 0}
                </button>

                <button class="action-button" data-action="comments" data-id="${post.id}">
                    <i data-lucide="message-circle"></i>
                    ${state.database.comments.filter(comment => comment.postId === post.id).length}
                </button>
            </div>

            <button class="read-more" data-action="open" data-id="${post.id}">
                Read More
                <i data-lucide="arrow-up-right"></i>
            </button>
        </div>
    `;

    return card;
}

function renderFiles(files) {
    if (!files.length) {
        return "";
    }

    return `
        <div class="file-list">
            ${files.map(file => `
                <div class="file-row">
                    <div class="file-icon">
                        <i data-lucide="${fileIcon(file.name)}"></i>
                    </div>

                    <div class="file-info">
                        <div class="file-name">${escapeHTML(file.name)}</div>
                        <div class="file-meta">
                            ${formatBytes(file.size)} · ${escapeHTML(file.format || "FILE")}
                        </div>
                    </div>

                    <button class="download-button" data-download="${file.id}" data-post="${file.postId || ""}" title="Download">
                        <i data-lucide="download"></i>
                    </button>
                </div>
            `).join("")}
        </div>
    `;
}

async function handleFiles(event) {
    const files = [...event.target.files];

    if (files.length > 5) {
        toast("You can upload a maximum of 5 files.");
        event.target.value = "";
        return;
    }

    state.selectedFiles = [];

    for (const file of files) {
        if (file.size > 45000) {
            toast(`${file.name} is too large for the JSONBin test mode.`);
            continue;
        }

        const data = await fileToDataURL(file);

        state.selectedFiles.push({
            id: createId(),
            name: file.name,
            size: file.size,
            format: getExtension(file.name).toUpperCase() || "FILE",
            type: file.type || "application/octet-stream",
            data
        });
    }

    renderSelectedFiles();
}

function renderSelectedFiles() {
    $("#selectedFiles").innerHTML = state.selectedFiles.map(file => `
        <div class="selected-file">
            <span>${escapeHTML(file.name)}</span>
            <span>${formatBytes(file.size)}</span>
        </div>
    `).join("");
}

async function createPost(event) {
    event.preventDefault();

    if (!["teacher", "owner"].includes(state.currentUser.role)) {
        toast("Only teachers can post.");
        return;
    }

    if (state.currentUser.status === "muted") {
        toast("You are muted and cannot post.");
        return;
    }

    if (state.selectedFiles.length > 5) {
        toast("Maximum 5 files.");
        return;
    }

    const post = {
        id: createId(),
        authorId: state.currentUser.id,
        title: $("#postTitle").value.trim(),
        subtitle: $("#postSubtitle").value.trim(),
        description: $("#postDescription").value.trim(),
        section: $("#postSection").value,
        files: state.selectedFiles,
        likes: [],
        pinned: $("#postPinned").checked,
        highlighted: $("#postHighlighted").checked,
        createdAt: new Date().toISOString()
    };

    post.files = post.files.map(file => ({
        ...file,
        postId: post.id
    }));

    try {
        state.database = await ClassDropServer.getDatabase();

        state.database.posts.push(post);

        if ($("#postNotify").checked) {
            const recipients = state.database.users.filter(user => user.status !== "banned");

            recipients.forEach(user => {
                state.database.notifications.push({
                    id: createId(),
                    userId: user.id,
                    postId: post.id,
                    title: post.title || "New post",
                    message: `${state.currentUser.displayName} posted in ${post.section}.`,
                    createdAt: new Date().toISOString(),
                    read: false
                });
            });
        }

        await ClassDropServer.saveDatabase(state.database);

        closeModals();
        resetComposer();
        renderFeed();
        updateNotifications();

        toast("Post published.");
    } catch (error) {
        toast(error.message);
    }
}

async function handleFeedClick(event) {
    const download = event.target.closest("[data-download]");

    if (download) {
        const postId = download.dataset.post;
        const post = state.database.posts.find(item => item.id === postId);
        const file = post?.files.find(item => item.id === download.dataset.download);

        if (file) {
            downloadFile(file);
        }

        return;
    }

    const action = event.target.closest("[data-action]");

    if (!action) {
        return;
    }

    const id = action.dataset.id;

    if (action.dataset.action === "like") {
        await toggleLike(id);
    }

    if (action.dataset.action === "open") {
        openPost(id);
    }

    if (action.dataset.action === "comments") {
        openPost(id);
    }
}

async function toggleLike(postId) {
    const post = state.database.posts.find(item => item.id === postId);

    if (!post) {
        return;
    }

    post.likes ||= [];

    const index = post.likes.indexOf(state.currentUser.id);

    if (index >= 0) {
        post.likes.splice(index, 1);
    } else {
        post.likes.push(state.currentUser.id);
    }

    try {
        await ClassDropServer.saveDatabase(state.database);
        renderFeed();
    } catch (error) {
        toast(error.message);
    }
}

function openPost(postId) {
    const post = state.database.posts.find(item => item.id === postId);

    if (!post) {
        return;
    }

    const author = findUser(post.authorId);
    const comments = state.database.comments
        .filter(comment => comment.postId === post.id)
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    $("#postModalContent").innerHTML = `
        <div class="modal-header">
            <div>
                <p class="eyebrow">${escapeHTML(post.section)}</p>
                <h2>Post</h2>
            </div>

            <button class="icon-button close-modal">
                <i data-lucide="x"></i>
            </button>
        </div>

        <div class="post-meta">
            <div class="author">
                <div class="author-avatar">${escapeHTML(initials(author?.displayName || "U"))}</div>
                <div>
                    <div class="author-name">${escapeHTML(author?.displayName || "Unknown")}</div>
                    <div class="author-role">${escapeHTML(roleLabel(author?.role || "student"))}</div>
                </div>
            </div>

            <div class="post-time">${timeAgo(post.createdAt)}</div>
        </div>

        ${post.title ? `<h1 class="post-detail-title">${escapeHTML(post.title)}</h1>` : ""}
        ${post.subtitle ? `<div class="post-subtitle">${escapeHTML(post.subtitle)}</div>` : ""}

        <div class="post-detail-description">${escapeHTML(post.description || "No description provided.")}</div>

        ${renderFiles(post.files || [])}

        <div class="comments">
            <h3>Comments</h3>

            <div class="comment-list">
                ${comments.length ? comments.map(renderComment).join("") : `
                    <div class="comment">
                        <div class="comment-text">No comments yet.</div>
                    </div>
                `}
            </div>

            <form class="comment-form" data-comment-post="${post.id}">
                <input type="text" maxlength="500" placeholder="Write a comment..." required>
                <button class="primary-button" type="submit">
                    <i data-lucide="send"></i>
                </button>
            </form>
        </div>
    `;

    openModal("#postModal");
    lucide.createIcons();

    $("#postModalContent").querySelector(".close-modal").addEventListener("click", closeModals);
}

function renderComment(comment) {
    const user = findUser(comment.userId);

    return `
        <div class="comment">
            <div class="comment-top">
                <span class="comment-author">${escapeHTML(user?.displayName || "Unknown")}</span>
                <span class="comment-date">${timeAgo(comment.createdAt)}</span>
            </div>

            <div class="comment-text">${DOMPurify.sanitize(comment.text)}</div>
        </div>
    `;
}

async function handlePostModalClick(event) {
    const download = event.target.closest("[data-download]");

    if (download) {
        const post = state.database.posts.find(item => item.id === download.dataset.post);
        const file = post?.files.find(item => item.id === download.dataset.download);

        if (file) {
            downloadFile(file);
        }

        return;
    }

    const form = event.target.closest("[data-comment-post]");

    if (form) {
        event.preventDefault();
    }
}

document.addEventListener("submit", async event => {
    const form = event.target.closest("[data-comment-post]");

    if (!form) {
        return;
    }

    event.preventDefault();

    if (state.currentUser.status === "muted") {
        toast("You are muted and cannot comment.");
        return;
    }

    const input = form.querySelector("input");
    const text = input.value.trim();

    if (!text) {
        return;
    }

    state.database.comments.push({
        id: createId(),
        postId: form.dataset.commentPost,
        userId: state.currentUser.id,
        text,
        createdAt: new Date().toISOString()
    });

    try {
        await ClassDropServer.saveDatabase(state.database);
        openPost(form.dataset.commentPost);
        renderFeed();
    } catch (error) {
        toast(error.message);
    }
});

function openAdmin() {
    if (state.currentUser.role !== "owner") {
        return;
    }

    renderAdmin();
    openModal("#adminModal");
}

function renderAdmin() {
    const users = state.database.users;

    $("#accountCount").textContent = users.length;
    $("#postCount").textContent = state.database.posts.length;
    $("#teacherCount").textContent = users.filter(user => user.role === "teacher").length;

    $("#accountsList").innerHTML = users.map(user => `
        <div class="account-row" data-user="${user.id}">
            <div class="avatar">${escapeHTML(initials(user.displayName))}</div>

            <div class="account-row-info">
                <strong>${escapeHTML(user.displayName)}</strong>
                <span>@${escapeHTML(user.username)} · ${escapeHTML(user.status)}</span>
            </div>

            <div class="account-controls">
                <select data-role="${user.id}" ${user.role === "owner" ? "disabled" : ""}>
                    <option value="student" ${user.role === "student" ? "selected" : ""}>Student</option>
                    <option value="teacher" ${user.role === "teacher" ? "selected" : ""}>Teacher</option>
                </select>

                ${user.role !== "owner" ? `
                    <button class="small-button" data-admin-action="save-role" data-id="${user.id}">Save</button>
                    <button class="small-button" data-admin-action="mute" data-id="${user.id}">
                        ${user.status === "muted" ? "Unmute" : "Mute"}
                    </button>
                    <button class="small-button" data-admin-action="ban" data-id="${user.id}">
                        ${user.status === "banned" ? "Unban" : "Ban"}
                    </button>
                ` : ""}
            </div>
        </div>
    `).join("");

    lucide.createIcons();
}

async function handleAccountClick(event) {
    const button = event.target.closest("[data-admin-action]");

    if (!button) {
        return;
    }

    const userId = button.dataset.id;
    const user = state.database.users.find(item => item.id === userId);

    if (!user || user.role === "owner") {
        return;
    }

    const action = button.dataset.adminAction;

    if (action === "save-role") {
        const select = document.querySelector(`[data-role="${userId}"]`);
        user.role = select.value;
        toast(`${user.displayName} is now a ${roleLabel(user.role)}.`);
    }

    if (action === "mute") {
        user.status = user.status === "muted" ? "active" : "muted";
        toast(`${user.displayName} is ${user.status === "muted" ? "muted" : "unmuted"}.`);
    }

    if (action === "ban") {
        user.status = user.status === "banned" ? "active" : "banned";
        toast(`${user.displayName} is ${user.status === "banned" ? "banned" : "unbanned"}.`);
    }

    try {
        await ClassDropServer.saveDatabase(state.database);
        renderAdmin();
    } catch (error) {
        toast(error.message);
    }
}

function updateNotifications() {
    if (!state.currentUser || !state.database) {
        return;
    }

    const notifications = state.database.notifications
        .filter(item => item.userId === state.currentUser.id)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 30);

    const unread = notifications.some(item => !item.read);

    $("#notificationDot").classList.toggle("hidden", !unread);

    $("#notificationsList").innerHTML = notifications.length
        ? notifications.map(item => `
            <div class="notification-item">
                <strong>${escapeHTML(item.title)}</strong>
                <p>${escapeHTML(item.message)}</p>
                <time>${timeAgo(item.createdAt)}</time>
            </div>
        `).join("")
        : `<div class="empty-state"><p>No notifications.</p></div>`;
}

async function toggleNotifications() {
    const panel = $("#notificationsPanel");
    panel.classList.toggle("hidden");

    if (!panel.classList.contains("hidden")) {
        state.database.notifications.forEach(notification => {
            if (notification.userId === state.currentUser.id) {
                notification.read = true;
            }
        });

        try {
            await ClassDropServer.saveDatabase(state.database);
            updateNotifications();
        } catch {
        }
    }
}

async function clearNotifications() {
    state.database.notifications = state.database.notifications.filter(
        notification => notification.userId !== state.currentUser.id
    );

    try {
        await ClassDropServer.saveDatabase(state.database);
        updateNotifications();
        toast("Notifications cleared.");
    } catch (error) {
        toast(error.message);
    }
}

async function refresh() {
    try {
        state.database = await ClassDropServer.getDatabase();

        const user = state.database.users.find(item => item.id === state.currentUser.id);

        if (!user || user.status === "banned") {
            logout();
            return;
        }

        state.currentUser = user;
        updateAccountUI();
        renderFeed();
        updateNotifications();

        toast("Updated.");
    } catch (error) {
        toast(error.message);
    }
}

function logout() {
    localStorage.removeItem("classdrop_user");
    state.currentUser = null;
    state.database = null;

    closeModals();
    $("#notificationsPanel").classList.add("hidden");

    showAuth();
}

function openModal(selector) {
    $(selector).classList.remove("hidden");

    gsap.fromTo(
        `${selector} .modal-card`,
        { opacity: 0, y: 18, scale: .98 },
        { opacity: 1, y: 0, scale: 1, duration: .25, ease: "power2.out" }
    );
}

function closeModals() {
    $$(".modal").forEach(modal => modal.classList.add("hidden"));
}

function resetComposer() {
    $("#postForm").reset();
    state.selectedFiles = [];
    $("#selectedFiles").innerHTML = "";
}

function downloadFile(file) {
    if (!file.data) {
        toast("This file has no downloadable data.");
        return;
    }

    const link = document.createElement("a");
    link.href = file.data;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
}

function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;

        reader.readAsDataURL(file);
    });
}

async function hashPassword(value) {
    const buffer = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(value)
    );

    return [...new Uint8Array(buffer)]
        .map(byte => byte.toString(16).padStart(2, "0"))
        .join("");
}

function createId() {
    return `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
}

function findUser(id) {
    return state.database.users.find(user => user.id === id);
}

function roleLabel(role) {
    return {
        owner: "Owner",
        teacher: "Teacher",
        student: "Student"
    }[role] || "Student";
}

function initials(value) {
    return value
        .split(/\s+/)
        .map(part => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
}

function formatBytes(bytes) {
    if (!bytes) {
        return "0 B";
    }

    const units = ["B", "KB", "MB", "GB"];
    const index = Math.floor(Math.log(bytes) / Math.log(1024));

    return `${(bytes / Math.pow(1024, index)).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function getExtension(name) {
    const parts = name.split(".");
    return parts.length > 1 ? parts.pop() : "";
}

function fileIcon(name) {
    const extension = getExtension(name).toLowerCase();

    if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(extension)) {
        return "image";
    }

    if (["mp4", "mov", "webm", "avi"].includes(extension)) {
        return "video";
    }

    if (["mp3", "wav", "ogg", "flac"].includes(extension)) {
        return "music";
    }

    if (["pdf"].includes(extension)) {
        return "file-text";
    }

    if (["doc", "docx", "txt", "rtf"].includes(extension)) {
        return "file-text";
    }

    if (["xls", "xlsx", "csv"].includes(extension)) {
        return "table";
    }

    if (["ppt", "pptx"].includes(extension)) {
        return "presentation";
    }

    if (["zip", "rar", "7z", "tar", "gz"].includes(extension)) {
        return "archive";
    }

    if (["js", "html", "css", "json", "lua", "py"].includes(extension)) {
        return "code";
    }

    return "file";
}

function timeAgo(date) {
    try {
        return dateFns.formatDistanceToNow(new Date(date), {
            addSuffix: true
        });
    } catch {
        return "recently";
    }
}

function escapeHTML(value) {
    const div = document.createElement("div");
    div.textContent = value ?? "";
    return div.innerHTML;
}

function toast(message) {
    const element = document.createElement("div");
    element.className = "toast";
    element.textContent = message;

    $("#toastContainer").appendChild(element);

    gsap.fromTo(
        element,
        { opacity: 0, y: 12 },
        { opacity: 1, y: 0, duration: .2 }
    );

    setTimeout(() => {
        gsap.to(element, {
            opacity: 0,
            y: 8,
            duration: .2,
            onComplete: () => element.remove()
        });
    }, 3000);
}
