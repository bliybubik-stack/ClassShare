const ClassDropServer = (() => {
    const BIN_ID = "6a996f27da38895dfe33dbb4";
    const MASTER_KEY = "PASTE_NEW_MASTER_KEY_HERE";
    const API = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

    async function request(url, options = {}) {
        const response = await fetch(url, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                "X-Master-Key": MASTER_KEY,
                ...(options.headers || {})
            }
        });

        const text = await response.text();

        let data;

        try {
            data = JSON.parse(text);
        } catch {
            data = { message: text };
        }

        if (!response.ok) {
            throw new Error(data.message || `Request failed with ${response.status}`);
        }

        return data;
    }

    async function getDatabase() {
        const data = await request(`${API}?meta=false`);

        return {
            users: Array.isArray(data.users) ? data.users : [],
            posts: Array.isArray(data.posts) ? data.posts : [],
            comments: Array.isArray(data.comments) ? data.comments : [],
            notifications: Array.isArray(data.notifications) ? data.notifications : [],
            settings: data.settings || {
                siteName: "ClassDrop",
                maxFilesPerPost: 5,
                sections: ["General", "My Class", "Off Topic"]
            }
        };
    }

    async function saveDatabase(database) {
        const payload = JSON.stringify(database);
        const bytes = new TextEncoder().encode(payload).length;

        if (bytes > 95000) {
            throw new Error("The JSONBin record is too large. Remove some files or use smaller test files.");
        }

        return request(API, {
            method: "PUT",
            body: payload
        });
    }

    return {
        getDatabase,
        saveDatabase,
        BIN_ID
    };
})();
