const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {URL} = require("url");

const PORT = Number(process.env.PORT || 3000);
const BIN_ID = "6a996f27da38895dfe33dbb4";
const JSONBIN_KEY = process.env.JSONBIN_MASTER_KEY;
const OWNER_PASSWORD = process.env.CLASSDROP_OWNER_PASSWORD || "";

if (!JSONBIN_KEY) {
  console.error("Set JSONBIN_MASTER_KEY before starting the server.");
  process.exit(1);
}

if (!OWNER_PASSWORD) {
  console.error("Set CLASSDROP_OWNER_PASSWORD before starting the server.");
  process.exit(1);
}

const root = __dirname;
const uploadsDir = path.join(root, "uploads");
fs.mkdirSync(uploadsDir, {recursive: true});

const binUrl = `https://api.jsonbin.io/v3/b/${BIN_ID}`;
const sessions = new Map();

const defaultData = {
  users: [],
  posts: [],
  comments: [],
  notifications: [],
  settings: {
    siteName: "ClassDrop",
    maxFilesPerPost: 5,
    sections: ["General", "My Class", "Off Topic"]
  }
};

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function checkPassword(password, stored) {
  const [salt, expected] = String(stored).split(":");
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

function id() {
  return crypto.randomBytes(12).toString("hex");
}

function cleanUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt
  };
}

function getToken(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

function getUser(req, data) {
  const token = getToken(req);
  const userId = sessions.get(token);
  if (!userId) return null;
  return data.users.find(user => user.id === userId && user.status !== "banned") || null;
}

function requireUser(req, data) {
  const user = getUser(req, data);
  if (!user) throw new Error("You need to log in.");
  if (user.status === "muted") throw new Error("Your account is muted.");
  return user;
}

function requireOwner(req, data) {
  const user = requireUser(req, data);
  if (user.role !== "owner") throw new Error("Owner access required.");
  return user;
}

function requireTeacher(req, data) {
  const user = requireUser(req, data);
  if (!["teacher", "owner"].includes(user.role)) throw new Error("Teacher access required.");
  return user;
}

async function readBin() {
  const response = await fetch(`${binUrl}/latest`, {
    headers: {
      "X-Master-Key": JSONBIN_KEY
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`JSONBin read failed: ${response.status} ${text}`);
  }

  const result = await response.json();
  return normalizeData(result.record || defaultData);
}

async function writeBin(data) {
  const response = await fetch(binUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Master-Key": JSONBIN_KEY,
      "X-Bin-Versioning": "true"
    },
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`JSONBin update failed: ${response.status} ${text}`);
  }

  return response.json();
}

function normalizeData(data) {
  return {
    users: Array.isArray(data.users) ? data.users : [],
    posts: Array.isArray(data.posts) ? data.posts : [],
    comments: Array.isArray(data.comments) ? data.comments : [],
    notifications: Array.isArray(data.notifications) ? data.notifications : [],
    settings: {
      ...defaultData.settings,
      ...(data.settings || {})
    }
  };
}

async function ensureOwner(data) {
  let owner = data.users.find(user => user.username === "WVOwner");

  if (!owner) {
    owner = {
      id: id(),
      username: "WVOwner",
      displayName: "WVOwner",
      passwordHash: hashPassword(OWNER_PASSWORD),
      role: "owner",
      status: "active",
      createdAt: new Date().toISOString()
    };
    data.users.push(owner);
    await writeBin(data);
  }

  return owner;
}

function send(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  });
  res.end(body);
}

function sendText(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    const limit = 150 * 1024 * 1024;

    req.on("data", chunk => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("Request is too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });

    req.on("error", reject);
  });
}

function safeFileName(name) {
  return path.basename(name).replace(/[^\w.\- ()[\]]/g, "_").slice(0, 180);
}

function fileExtension(name) {
  const ext = path.extname(name).replace(".", "").toLowerCase();
  return ext || "file";
}

function saveUploadedFile(file) {
  if (!file || !file.name || !file.data) throw new Error("Invalid file.");

  const comma = file.data.indexOf(",");
  if (comma === -1) throw new Error("Invalid file data.");

  const buffer = Buffer.from(file.data.slice(comma + 1), "base64");
  const fileId = id();
  const storedName = `${fileId}-${safeFileName(file.name)}`;
  const storedPath = path.join(uploadsDir, storedName);

  fs.writeFileSync(storedPath, buffer);

  return {
    id: fileId,
    name: safeFileName(file.name),
    size: buffer.length,
    type: file.type || "application/octet-stream",
    extension: fileExtension(file.name),
    storedName
  };
}

function publicPost(post, data) {
  const comments = data.comments.filter(comment => comment.postId === post.id);
  return {
    ...post,
    comments: comments.map(comment => ({
      id: comment.id,
      authorName: comment.authorName,
      text: comment.text,
      createdAt: comment.createdAt
    }))
  };
}

function removePostFiles(post) {
  for (const file of post.files || []) {
    const filePath = path.join(uploadsDir, file.storedName);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
}

async function handle(req, res) {
  cors(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (pathname.startsWith("/api/")) {
    let data = await readBin();

    if (pathname === "/api/signup" && req.method === "POST") {
      const body = await readBody(req);
      const displayName = String(body.displayName || "").trim();
      const username = String(body.username || "").trim();
      const password = String(body.password || "");

      if (displayName.length < 1 || displayName.length > 50) throw new Error("Enter a valid display name.");
      if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(username)) throw new Error("Username must be 3-30 characters and use letters, numbers, dots, dashes or underscores.");
      if (password.length < 8) throw new Error("Password must be at least 8 characters.");
      if (username.toLowerCase() === "wvowner") throw new Error("That username is reserved.");
      if (data.users.some(user => user.username.toLowerCase() === username.toLowerCase())) throw new Error("Username is already taken.");

      const user = {
        id: id(),
        username,
        displayName,
        passwordHash: hashPassword(password),
        role: "student",
        status: "active",
        createdAt: new Date().toISOString()
      };

      data.users.push(user);
      await writeBin(data);

      const token = crypto.randomBytes(32).toString("hex");
      sessions.set(token, user.id);
      send(res, 200, {user: cleanUser(user), token});
      return;
    }

    if (pathname === "/api/login" && req.method === "POST") {
      const body = await readBody(req);
      const username = String(body.username || "").trim();
      const password = String(body.password || "");

      const user = data.users.find(item => item.username.toLowerCase() === username.toLowerCase());

      if (!user || !checkPassword(password, user.passwordHash)) throw new Error("Invalid username or password.");
      if (user.status === "banned") throw new Error("This account is banned.");

      const token = crypto.randomBytes(32).toString("hex");
      sessions.set(token, user.id);
      send(res, 200, {user: cleanUser(user), token});
      return;
    }

    if (pathname === "/api/session" && req.method === "POST") {
      const user = getUser(req, data);
      if (!user) throw new Error("Session expired.");
      send(res, 200, {user: cleanUser(user)});
      return;
    }

    if (pathname === "/api/posts" && req.method === "GET") {
      const user = getUser(req, data);
      if (!user) throw new Error("You need to log in.");

      const section = url.searchParams.get("section");
      if (!data.settings.sections.includes(section)) throw new Error("Invalid section.");

      const posts = data.posts
        .filter(post => post.section === section)
        .map(post => publicPost(post, data));

      send(res, 200, {posts});
      return;
    }

    if (pathname === "/api/posts" && req.method === "POST") {
      const user = requireTeacher(req, data);
      const body = await readBody(req);
      const files = Array.isArray(body.files) ? body.files : [];

      if (files.length > 5) throw new Error("A post can contain up to 5 files.");
      if (!data.settings.sections.includes(body.section)) throw new Error("Invalid section.");

      const savedFiles = [];
      try {
        for (const file of files) savedFiles.push(saveUploadedFile(file));
      } catch (error) {
        for (const file of savedFiles) {
          const filePath = path.join(uploadsDir, file.storedName);
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
        throw error;
      }

      const post = {
        id: id(),
        authorId: user.id,
        authorName: user.displayName,
        section: body.section,
        title: String(body.title || "").slice(0, 120),
        subtitle: String(body.subtitle || "").slice(0, 160),
        description: String(body.description || "").slice(0, 4000),
        files: savedFiles,
        likes: [],
        pinned: Boolean(body.pinned),
        highlighted: Boolean(body.highlighted),
        createdAt: new Date().toISOString()
      };

      data.posts.push(post);

      if (body.notify) {
        const message = `${user.displayName} posted new material in ${post.section}.`;
        data.notifications.push({
          id: id(),
          type: "post",
          message,
          postId: post.id,
          createdAt: new Date().toISOString()
        });
      }

      await writeBin(data);
      send(res, 200, {post: publicPost(post, data)});
      return;
    }

    const postMatch = pathname.match(/^\/api\/posts\/([^/]+)$/);
    if (postMatch && req.method === "GET") {
      requireUser(req, data);
      const post = data.posts.find(item => item.id === postMatch[1]);
      if (!post) throw new Error("Post not found.");
      send(res, 200, {post: publicPost(post, data)});
      return;
    }

    const likeMatch = pathname.match(/^\/api\/posts\/([^/]+)\/like$/);
    if (likeMatch && req.method === "POST") {
      const user = requireUser(req, data);
      const post = data.posts.find(item => item.id === likeMatch[1]);
      if (!post) throw new Error("Post not found.");

      post.likes = Array.isArray(post.likes) ? post.likes : [];
      const index = post.likes.indexOf(user.id);

      if (index === -1) post.likes.push(user.id);
      else post.likes.splice(index, 1);

      await writeBin(data);
      send(res, 200, {likes: post.likes});
      return;
    }

    const commentMatch = pathname.match(/^\/api\/posts\/([^/]+)\/comments$/);
    if (commentMatch && req.method === "POST") {
      const user = requireUser(req, data);
      const body = await readBody(req);
      const text = String(body.text || "").trim();

      if (!text || text.length > 500) throw new Error("Comment must be 1-500 characters.");

      const post = data.posts.find(item => item.id === commentMatch[1]);
      if (!post) throw new Error("Post not found.");

      const comment = {
        id: id(),
        postId: post.id,
        authorId: user.id,
        authorName: user.displayName,
        text,
        createdAt: new Date().toISOString()
      };

      data.comments.push(comment);
      await writeBin(data);
      send(res, 200, {comment});
      return;
    }

    const fileMatch = pathname.match(/^\/api\/files\/([^/]+)$/);
    if (fileMatch && req.method === "GET") {
      requireUser(req, data);

      const targetId = fileMatch[1];
      let found = null;

      for (const post of data.posts) {
        const file = (post.files || []).find(item => item.id === targetId);
        if (file) {
          found = file;
          break;
        }
      }

      if (!found) {
        send(res, 404, {error: "File not found."});
        return;
      }

      const filePath = path.join(uploadsDir, found.storedName);
      if (!fs.existsSync(filePath)) {
        send(res, 404, {error: "File is missing from server storage."});
        return;
      }

      res.writeHead(200, {
        "Content-Type": found.type || "application/octet-stream",
        "Content-Length": fs.statSync(filePath).size,
        "Content-Disposition": `attachment; filename="${found.name.replace(/"/g, "")}"`,
        "X-Content-Type-Options": "nosniff"
      });

      fs.createReadStream(filePath).pipe(res);
      return;
    }

    if (pathname === "/api/admin/users" && req.method === "GET") {
      requireOwner(req, data);
      send(res, 200, {users: data.users.map(cleanUser)});
      return;
    }

    const roleMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/role$/);
    if (roleMatch && req.method === "POST") {
      const owner = requireOwner(req, data);
      const body = await readBody(req);
      const user = data.users.find(item => item.id === roleMatch[1]);

      if (!user) throw new Error("User not found.");
      if (user.id === owner.id) throw new Error("The owner role cannot be changed.");
      if (!["student", "teacher"].includes(body.role)) throw new Error("Invalid role.");

      user.role = body.role;
      await writeBin(data);
      send(res, 200, {user: cleanUser(user)});
      return;
    }

    const statusMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/status$/);
    if (statusMatch && req.method === "POST") {
      const owner = requireOwner(req, data);
      const body = await readBody(req);
      const user = data.users.find(item => item.id === statusMatch[1]);

      if (!user) throw new Error("User not found.");
      if (user.id === owner.id) throw new Error("You cannot moderate the owner account.");

      if (body.action === "toggle-mute") {
        user.status = user.status === "muted" ? "active" : "muted";
      } else if (body.action === "toggle-ban") {
        user.status = user.status === "banned" ? "active" : "banned";
      } else {
        throw new Error("Invalid moderation action.");
      }

      await writeBin(data);
      send(res, 200, {user: cleanUser(user)});
      return;
    }

    throw new Error("API route not found.");
  }

  if (req.method === "GET") {
    const requested = pathname === "/" ? "index.html" : pathname.slice(1);
    const filePath = path.resolve(root, requested);

    if (!filePath.startsWith(root)) {
      sendText(res, 403, "Forbidden");
      return;
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      sendText(res, 404, "Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const types = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8"
    };

    res.writeHead(200, {"Content-Type": types[ext] || "application/octet-stream"});
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  sendText(res, 405, "Method not allowed");
}

async function start() {
  const data = await readBin();
  await ensureOwner(data);

  const server = http.createServer(async (req, res) => {
    try {
      await handle(req, res);
    } catch (error) {
      console.error(error);
      send(res, 400, {error: error.message || "Request failed."});
    }
  });

  server.listen(PORT, () => {
    console.log(`ClassDrop running at http://localhost:${PORT}`);
  });
}

start().catch(error => {
  console.error(error);
  process.exit(1);
});
