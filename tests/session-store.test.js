const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const { SQLiteSessionStore } = require("../session-store");

function call(store, method, ...args) {
  return new Promise((resolve, reject) => {
    store[method](...args, (error, value) => error ? reject(error) : resolve(value));
  });
}

test("SQLite session store persists, touches, expires and destroys sessions", async (t) => {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE web_sessions (
      sid TEXT PRIMARY KEY,
      sess TEXT NOT NULL,
      expires INTEGER NOT NULL
    );
    CREATE INDEX idx_web_sessions_expires ON web_sessions(expires);
  `);
  const store = new SQLiteSessionStore(db);
  t.after(() => db.close());

  const expiry = new Date(Date.now() + 60_000).toISOString();
  const sess = { cookie: { expires: expiry, maxAge: 60_000 }, isAdmin: true };
  await call(store, "set", "sid-valid", sess);
  assert.deepEqual(await call(store, "get", "sid-valid"), sess);

  const extendedExpiry = new Date(Date.now() + 120_000).toISOString();
  await call(store, "touch", "sid-valid", { cookie: { expires: extendedExpiry } });
  assert.equal(db.prepare("SELECT expires FROM web_sessions WHERE sid = ?").get("sid-valid").expires, Date.parse(extendedExpiry));

  await call(store, "set", "sid-expired", { cookie: { expires: new Date(Date.now() - 1_000).toISOString() } });
  assert.equal(await call(store, "get", "sid-expired"), null);
  assert.equal(db.prepare("SELECT 1 FROM web_sessions WHERE sid = ?").get("sid-expired"), undefined);

  await call(store, "destroy", "sid-valid");
  assert.equal(await call(store, "get", "sid-valid"), null);
});

test("SQLite session store prunes expired rows", () => {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE web_sessions (sid TEXT PRIMARY KEY, sess TEXT NOT NULL, expires INTEGER NOT NULL)");
  const store = new SQLiteSessionStore(db);
  db.prepare("INSERT INTO web_sessions (sid, sess, expires) VALUES (?, ?, ?)").run("old", "{}", Date.now() - 1000);
  db.prepare("INSERT INTO web_sessions (sid, sess, expires) VALUES (?, ?, ?)").run("new", "{}", Date.now() + 60_000);
  store.pruneStatement.run(Date.now());
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM web_sessions").get().count, 1);
  assert.ok(db.prepare("SELECT 1 FROM web_sessions WHERE sid = ?").get("new"));
  db.close();
});
