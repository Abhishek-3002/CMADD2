const crypto = require("crypto");

function registerOfferRoutes(app, db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS festival_offers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      offer_code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      eligible_categories TEXT NOT NULL DEFAULT 'All eligible products',
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      whatsapp_number TEXT NOT NULL DEFAULT '8000540156',
      active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_festival_offers_active_dates ON festival_offers(active, starts_at, ends_at);
  `);

  const clean = v => String(v ?? "").trim();
  const validDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + "T00:00:00Z"));

  app.get("/api/offers", (req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    try {
      const offers = db.prepare(`
        SELECT offer_code AS offerCode, title, description,
          eligible_categories AS eligibleCategories, starts_at AS startsAt,
          ends_at AS endsAt, whatsapp_number AS whatsappNumber
        FROM festival_offers
        WHERE active = 1 AND starts_at <= ? AND ends_at >= ?
        ORDER BY starts_at DESC, id DESC
      `).all(today, today);
      res.set("Cache-Control", "no-store");
      return res.json({ success: true, offers });
    } catch (error) {
      console.error("Public offers read failed:", error);
      return res.status(500).json({ success: false, message: "Unable to load offers." });
    }
  });

  app.get("/api/admin/offers", (req, res) => {
    if (!req.session || !req.session.isAdmin) return res.status(401).json({ success: false, message: "Admin login required." });
    try {
      return res.json({ success: true, offers: db.prepare("SELECT * FROM festival_offers ORDER BY id DESC").all() });
    } catch (error) {
      console.error("Admin offers read failed:", error);
      return res.status(500).json({ success: false, message: "Unable to load offers." });
    }
  });

  app.post("/api/admin/offers", (req, res) => {
    if (!req.session || !req.session.isAdmin) return res.status(401).json({ success: false, message: "Admin login required." });
    const title = clean(req.body.title), description = clean(req.body.description);
    const categories = clean(req.body.eligibleCategories) || "All eligible products";
    const startsAt = clean(req.body.startsAt), endsAt = clean(req.body.endsAt);
    const active = req.body.active === false || req.body.active === 0 ? 0 : 1;
    const whatsappNumber = "8000540156";
    if (!title || title.length > 120 || !description || description.length > 1000 ||
        categories.length > 250 || !validDate(startsAt) || !validDate(endsAt) || endsAt < startsAt) {
      return res.status(400).json({ success: false, message: "Enter a title, description, eligible category, and valid date range." });
    }
    try {
      const offerCode = "OFF-" + Date.now().toString(36).toUpperCase() + "-" + crypto.randomBytes(2).toString("hex").toUpperCase();
      db.prepare(`INSERT INTO festival_offers (offer_code,title,description,eligible_categories,starts_at,ends_at,whatsapp_number,active) VALUES (?,?,?,?,?,?,?,?)`)
        .run(offerCode,title,description,categories,startsAt,endsAt,whatsappNumber,active);
      return res.status(201).json({ success: true, offerCode, message: "Offer created." });
    } catch (error) {
      console.error("Offer creation failed:", error);
      return res.status(500).json({ success: false, message: "Unable to create offer." });
    }
  });

  app.put("/api/admin/offers/:id", (req, res) => {
    if (!req.session || !req.session.isAdmin) return res.status(401).json({ success: false, message: "Admin login required." });
    const id = Number(req.params.id), active = req.body.active;
    if (!Number.isSafeInteger(id) || id < 1 || ![0,1,false,true].includes(active)) return res.status(400).json({ success: false, message: "Invalid offer update." });
    try {
      const result = db.prepare("UPDATE festival_offers SET active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(active === true ? 1 : active === false ? 0 : active, id);
      if (!result.changes) return res.status(404).json({ success: false, message: "Offer not found." });
      return res.json({ success: true, message: "Offer status updated." });
    } catch (error) {
      console.error("Offer update failed:", error);
      return res.status(500).json({ success: false, message: "Unable to update offer." });
    }
  });
}
module.exports = { registerOfferRoutes };
