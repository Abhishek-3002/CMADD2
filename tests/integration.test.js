const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const session = require("express-session");
const Database = require("better-sqlite3");
const { registerCustomerAuth } = require("../auth");
const { registerCustomerLedger } = require("../ledger");
const { registerBusinessRoutes } = require("../business");

test("customer auth, private admin routes, sales targets, MR points and ledger score", async (t) => {
  const db = new Database(":memory:");
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(session({ secret: "test-only-session-secret", resave: false, saveUninitialized: false }));
  registerCustomerAuth(app, db);
  registerCustomerLedger(app, db);
  registerBusinessRoutes(app, db);
  // This route exists only in this isolated test app; it is not part of production server.js.
  app.post("/__test/admin-session", (req, res) => {
    req.session.isAdmin = true;
    res.json({ success: true });
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  t.after(() => { server.close(); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(path, { method = "GET", body, cookie } = {}) {
    const response = await fetch(base + path, {
      method,
      headers: { ...(body ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    const rawCookie = response.headers.get("set-cookie");
    const data = await response.json();
    return { status: response.status, data, cookie: rawCookie ? rawCookie.split(";")[0] : cookie };
  }

  const blocked = await request("/api/admin/business/summary");
  assert.equal(blocked.status, 401, "business reports must require admin session");

  const reg = await request("/api/auth/register", { method: "POST", body: {
    medicalName: "Test Medical Store", customerName: "Test Customer",
    mobile: "9876543210", email: "test.customer@example.com", password: "StrongPass123"
  }});
  assert.equal(reg.status, 201);
  assert.equal(reg.data.status, "Pending");
  const userId = reg.data.customer.id;
  const pendingLogin = await request("/api/auth/login", { method: "POST", body: { email: "test.customer@example.com", password: "StrongPass123" } });
  assert.equal(pendingLogin.status, 403, "pending customers must not log in");

  db.prepare("UPDATE customer_users SET approval_status='Approved' WHERE id=?").run(userId);
  const adminSession = await request("/__test/admin-session", { method: "POST" });
  assert.ok(adminSession.cookie);
  const adminCookie = adminSession.cookie;

  const mr = await request("/api/admin/business/mrs", { method: "POST", cookie: adminCookie, body: { name: "Test MR", mobile: "9876543211", target: 50000 } });
  assert.equal(mr.status, 201);
  const sale = await request("/api/admin/business/sales", { method: "POST", cookie: adminCookie, body: { date: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }), amount: 1250, partyName: "Test Medical Store", mrName: "Test MR", note: "Test invoice" } });
  assert.equal(sale.status, 201);
  const target = await request("/api/admin/business/targets", { method: "POST", cookie: adminCookie, body: { periodType: "month", periodKey: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7), amount: 50000 } });
  assert.equal(target.status, 200);
  const summary = await request("/api/admin/business/summary", { cookie: adminCookie });
  assert.equal(summary.status, 200);
  assert.ok(summary.data.mr.some((rep) => rep.name === "Test MR" && rep.points === 2));
  assert.equal(summary.data.month.targetPaise, 5000000);
  const product = await request("/api/admin/products", { method: "POST", cookie: adminCookie, body: { name: "Test Syrup", category: "Syrup", description: "Test catalog item" } });
  assert.equal(product.status, 201);
  const catalog = await request("/api/products/catalog");
  assert.equal(catalog.status, 200);
  assert.ok(catalog.data.products.some((item) => item.name === "Test Syrup"));
  assert.equal("price" in catalog.data.products.find((item) => item.name === "Test Syrup"), false, "public catalog must not expose prices");

  await request(`/api/admin/customer-ledgers/${userId}`, { method: "POST", cookie: adminCookie, body: { type: "debit", amount: 30000, note: "Test invoice" } }).then((r) => assert.equal(r.status, 201));
  await request(`/api/admin/customer-ledgers/${userId}`, { method: "POST", cookie: adminCookie, body: { type: "credit", amount: 34000, note: "Test payment" } }).then((r) => assert.equal(r.status, 201));

  const login = await request("/api/auth/login", { method: "POST", body: { email: "test.customer@example.com", password: "StrongPass123" } });
  assert.equal(login.status, 200);
  const credit = await request("/api/customer/credit-score", { cookie: login.cookie });
  assert.equal(credit.status, 200);
  assert.equal(credit.data.credit.billedPaise, 3000000);
  assert.equal(credit.data.credit.paidPaise, 3400000);
  assert.ok(credit.data.credit.score >= 800, "overpayment should be reflected in internal score");
});
