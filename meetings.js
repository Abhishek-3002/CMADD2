const crypto = require("crypto");

function registerMeetingRoutes(app, db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meeting_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meeting_id TEXT NOT NULL UNIQUE,
      customer_name TEXT NOT NULL,
      medical_name TEXT NOT NULL,
      mobile TEXT NOT NULL,
      address TEXT NOT NULL,
      requested_date TEXT NOT NULL,
      requested_time TEXT NOT NULL,
      meeting_type TEXT NOT NULL CHECK(meeting_type IN ('Online', 'Offline Shop Visit')),
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending', 'Confirmed', 'Completed', 'Cancelled')),
      meeting_link TEXT NOT NULL DEFAULT '',
      admin_notes TEXT NOT NULL DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_meeting_requests_status ON meeting_requests(status);
  `);

  function makeMeetingId() {
    const date = new Date();
    const stamp = date.getFullYear().toString() + String(date.getMonth() + 1).padStart(2, "0") + String(date.getDate()).padStart(2, "0");
    return "MTG-" + stamp + "-" + crypto.randomBytes(3).toString("hex").toUpperCase();
  }

  app.post("/api/meetings", (req, res) => {
    const customerName = String(req.body.customerName || "").trim();
    const medicalName = String(req.body.medicalName || "").trim();
    const mobile = String(req.body.mobile || "").replace(/[\s-]/g, "");
    const address = String(req.body.address || "").trim();
    const requestedDate = String(req.body.date || "").trim();
    const requestedTime = String(req.body.time || "").trim();
    const meetingType = String(req.body.meetingType || "");
    const notes = String(req.body.notes || "").trim();

    if (!customerName || customerName.length > 120 || !medicalName || medicalName.length > 160 ||
        !/^\+?[0-9]{10,15}$/.test(mobile) || !address || address.length > 500 ||
        !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate) || !/^\d{2}:\d{2}$/.test(requestedTime) ||
        !["Online", "Offline Shop Visit"].includes(meetingType) || notes.length > 1000) {
      return res.status(400).json({ success: false, message: "Please complete all required fields with valid details." });
    }
    if (requestedDate < new Date().toISOString().slice(0, 10)) {
      return res.status(400).json({ success: false, message: "Please choose today or a future date." });
    }

    try {
      let meetingId, attempt = 0;
      do {
        meetingId = makeMeetingId();
        attempt++;
      } while (db.prepare("SELECT id FROM meeting_requests WHERE meeting_id = ?").get(meetingId) && attempt < 5);
      const result = db.prepare(`
        INSERT INTO meeting_requests
          (meeting_id, customer_name, medical_name, mobile, address, requested_date, requested_time, meeting_type, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(meetingId, customerName, medicalName, mobile, address, requestedDate, requestedTime, meetingType, notes);
      return res.status(201).json({ success: true, meetingId, message: "Meeting request submitted. The team will confirm it with you." });
    } catch (error) {
      console.error("Meeting request failed:", error);
      return res.status(500).json({ success: false, message: "Unable to submit meeting request right now." });
    }
  });

  app.get("/api/admin/meetings", (req, res) => {
    if (!req.session || !req.session.isAdmin) return res.status(401).json({ success: false, message: "Admin login required." });
    const status = String(req.query.status || "All");
    if (!["All", "Pending", "Confirmed", "Completed", "Cancelled"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status filter." });
    }
    try {
      const meetings = status === "All"
        ? db.prepare("SELECT * FROM meeting_requests ORDER BY requested_date DESC, requested_time DESC, id DESC").all()
        : db.prepare("SELECT * FROM meeting_requests WHERE status = ? ORDER BY requested_date DESC, requested_time DESC, id DESC").all(status);
      return res.json({ success: true, meetings });
    } catch (error) {
      console.error("Meeting list failed:", error);
      return res.status(500).json({ success: false, message: "Unable to load meeting requests." });
    }
  });

  app.put("/api/admin/meetings/:meetingId", (req, res) => {
    if (!req.session || !req.session.isAdmin) return res.status(401).json({ success: false, message: "Admin login required." });
    const meetingId = String(req.params.meetingId || "").trim().toUpperCase();
    const status = String(req.body.status || "");
    const meetingLink = String(req.body.meetingLink || "").trim();
    const adminNotes = String(req.body.adminNotes || "").trim();
    if (!/^MTG-\d{8}-[A-F0-9]{6}$/.test(meetingId) ||
        !["Pending", "Confirmed", "Completed", "Cancelled"].includes(status) ||
        meetingLink.length > 1000 || adminNotes.length > 1000) {
      return res.status(400).json({ success: false, message: "Invalid meeting update." });
    }
    if (meetingLink && !/^https:\/\//i.test(meetingLink)) {
      return res.status(400).json({ success: false, message: "Meeting links must use HTTPS." });
    }
    try {
      const result = db.prepare(`
        UPDATE meeting_requests SET status = ?, meeting_link = ?, admin_notes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE meeting_id = ?
      `).run(status, meetingLink, adminNotes, meetingId);
      if (!result.changes) return res.status(404).json({ success: false, message: "Meeting request not found." });
      return res.json({ success: true, message: "Meeting request updated." });
    } catch (error) {
      console.error("Meeting update failed:", error);
      return res.status(500).json({ success: false, message: "Unable to update meeting request." });
    }
  });
}

module.exports = { registerMeetingRoutes };
