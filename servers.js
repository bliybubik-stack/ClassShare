const APP_CONFIG = {
  binId: "6a996f27da38895dfe33dbb4",
  storageKey: "classshare_demo_v3",
  jsonBinKeyStorage: "classshare_jsonbin_key"
};

const DemoServer = {
  state: null,

  defaultState() {
    return {
      users: [],
      posts: [],
      meta: { version: 3, updatedAt: Date.now() }
    };
  },

  load() {
    const raw = localStorage.getItem(APP_CONFIG.storageKey);
    if (!raw) {
      this.state = this.defaultState();
      return this.state;
    }
    try {
      this.state = JSON.parse(raw);
    } catch {
      this.state = this.defaultState();
    }
    this.state.users ||= [];
    this.state.posts ||= [];
    this.state.meta ||= { version: 3, updatedAt: Date.now() };
    return this.state;
  },

  save() {
    this.state.meta.updatedAt = Date.now();
    localStorage.setItem(APP_CONFIG.storageKey, JSON.stringify(this.state));
    return this.state;
  },

  reset() {
    localStorage.removeItem(APP_CONFIG.storageKey);
    this.state = this.defaultState();
    return this.save();
  },

  getJsonBinKey() {
    return sessionStorage.getItem(APP_CONFIG.jsonBinKeyStorage) || "";
  },

  setJsonBinKey(key) {
    if (key) sessionStorage.setItem(APP_CONFIG.jsonBinKeyStorage, key.trim());
    else sessionStorage.removeItem(APP_CONFIG.jsonBinKeyStorage);
  },

  async readJsonBin() {
    const key = this.getJsonBinKey();
    if (!key) throw new Error("No JSONBin key is configured in this browser.");
    const response = await fetch(`https://api.jsonbin.io/v3/b/${APP_CONFIG.binId}/latest`, {
      headers: { "X-Master-Key": key }
    });
    if (!response.ok) throw new Error(`JSONBin read failed: ${response.status}`);
    const data = await response.json();
    return data.record;
  },

  async writeJsonBin(record) {
    const key = this.getJsonBinKey();
    if (!key) throw new Error("No JSONBin key is configured in this browser.");
    const response = await fetch(`https://api.jsonbin.io/v3/b/${APP_CONFIG.binId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Master-Key": key
      },
      body: JSON.stringify(record)
    });
    if (!response.ok) throw new Error(`JSONBin write failed: ${response.status}`);
    return response.json();
  },

  async pullFromJsonBin() {
    const record = await this.readJsonBin();
    if (!record || typeof record !== "object") throw new Error("The bin does not contain a valid ClassShare record.");
    this.state = {
      users: Array.isArray(record.users) ? record.users : [],
      posts: Array.isArray(record.posts) ? record.posts : [],
      meta: record.meta || { version: 3, updatedAt: Date.now() }
    };
    return this.save();
  },

  async pushToJsonBin() {
    this.state ||= this.load();
    return this.writeJsonBin(this.state);
  }
};

DemoServer.load();
