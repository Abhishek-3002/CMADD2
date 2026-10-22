function registerCustomerLedger(app, db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS customer_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customer_users(id) ON DELETE CASCADE,
      entry_type TEXT NOT NULL CHECK(entry_type IN ('debit', 'credit')),
      amount_paise INTEGER NOT NULL CHECK(amount_paise > 0),
      note TEXT NOT NULL DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_customer_ledger_customer_id ON customer_ledger(customer_id);
  `);

  app.get("/api/customer/ledger", (req, res) => {
    if (!req.session || !req.session.customerId) return res.status(401).json({ success: false, message: "Customer login required." });
    try {
      const customer = db.prepare("SELECT id, approval_status FROM customer_users WHERE id = ?").get(req.session.customerId);
      if (!customer || customer.approval_status !== "Approved") return res.status(403).json({ success: false, message: "Customer account is not approved." });
      const entries = db.prepare("SELECT id, entry_type AS type, amount_paise AS amountPaise, note, created_at AS createdAt FROM customer_ledger WHERE customer_id = ? ORDER BY id DESC LIMIT 500").all(customer.id);
      const balancePaise = db.prepare("SELECT COALESCE(SUM(CASE WHEN entry_type = 'debit' THEN amount_paise ELSE -amount_paise END), 0) AS balancePaise FROM customer_ledger WHERE customer_id = ?").get(customer.id).balancePaise;
      return res.json({ success: true, balancePaise, entries });
    } catch (error) {
      console.error("Customer ledger read failed:", error);
      return res.status(500).json({ success: false, message: "Unable to load ledger." });
    }
  });

  app.get("/api/admin/customer-ledgers", (req, res) => {
    if (!req.session || !req.session.isAdmin) return res.status(401).json({ success: false, message: "Admin login required." });
    try {
      const customers = db.prepare(`
        SELECT u.id, u.medical_name AS medicalName, u.customer_name AS customerName, u.mobile, u.email,
          u.approval_status AS approvalStatus,
          COALESCE(SUM(CASE WHEN l.entry_type = 'debit' THEN l.amount_paise ELSE -l.amount_paise END), 0) AS balancePaise
        FROM customer_users u LEFT JOIN customer_ledger l ON l.customer_id = u.id
        GROUP BY u.id ORDER BY u.medical_name COLLATE NOCASE
      `).all();
      return res.json({ success: true, customers });
    } catch (error) {
      console.error("Admin ledger list failed:", error);
      return res.status(500).json({ success: false, message: "Unable to load customer ledgers." });
    }
  });

  app.get("/api/admin/customer-ledgers/:id", (req, res) => {
    if (!req.session || !req.session.isAdmin) return res.status(401).json({ success: false, message: "Admin login required." });
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ success: false, message: "Invalid customer ID." });
    try {
      const customer = db.prepare("SELECT id, medical_name AS medicalName, customer_name AS customerName, mobile, email FROM customer_users WHERE id = ?").get(id);
      if (!customer) return res.status(404).json({ success: false, message: "Customer not found." });
      const entries = db.prepare("SELECT id, entry_type AS type, amount_paise AS amountPaise, note, created_at AS createdAt FROM customer_ledger WHERE customer_id = ? ORDER BY id DESC LIMIT 500").all(id);
      const balancePaise = db.prepare("SELECT COALESCE(SUM(CASE WHEN entry_type = 'debit' THEN amount_paise ELSE -amount_paise END), 0) AS balancePaise FROM customer_ledger WHERE customer_id = ?").get(id).balancePaise;
      return res.json({ success: true, customer, balancePaise, entries });
    } catch (error) {
      console.error("Admin ledger detail failed:", error);
      return res.status(500).json({ success: false, message: "Unable to load ledger." });
    }
  });

  app.post("/api/admin/customer-ledgers/:id", (req, res) => {
    if (!req.session || !req.session.isAdmin) return res.status(401).json({ success: false, message: "Admin login required." });
    const id = Number(req.params.id);
    const type = String(req.body.type || "");
    const amount = Number(req.body.amount);
    const note = String(req.body.note || "").trim();
    if (!Number.isSafeInteger(id) || id < 1 || !["debit", "credit"].includes(type) ||
        !Number.isFinite(amount) || amount <= 0 || amount > 100000000 || !note || note.length > 300) {
      return res.status(400).json({ success: false, message: "Enter a valid type, amount in rupees, and note (max 300 characters)." });
    }
    const amountPaise = Math.round(amount * 100);
    if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) return res.status(400).json({ success: false, message: "Invalid amount." });
    try {
      if (!db.prepare("SELECT id FROM customer_users WHERE id = ?").get(id)) return res.status(404).json({ success: false, message: "Customer not found." });
      const result = db.prepare("INSERT INTO customer_ledger (customer_id, entry_type, amount_paise, note) VALUES (?, ?, ?, ?)").run(id, type, amountPaise, note);
      return res.status(201).json({ success: true, entryId: Number(result.lastInsertRowid), message: "Ledger entry added." });
    } catch (error) {
      console.error("Admin ledger entry failed:", error);
      return res.status(500).json({ success: false, message: "Unable to save ledger entry." });
    }
  });
}
module.exports = { registerCustomerLedger };
