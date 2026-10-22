const crypto = require("crypto");

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
    const hash = crypto.scryptSync(password, salt, 64).toString("hex");
    return { salt, hash };
}

function verifyPassword(password, salt, expectedHash) {
    try {
        const actual = crypto.scryptSync(password, salt, 64);
        const expected = Buffer.from(expectedHash, "hex");
        return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
    } catch {
        return false;
    }
}

function ensureColumn(db, table, column, definition) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all();
    if (!columns.some((item) => item.name === column)) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
}

function registerCustomerAuth(app, db) {
    db.prepare(`
        CREATE TABLE IF NOT EXISTS customer_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            password_salt TEXT NOT NULL,
            medical_name TEXT NOT NULL DEFAULT '',
            customer_name TEXT NOT NULL DEFAULT '',
            mobile TEXT NOT NULL DEFAULT '',
            approval_status TEXT NOT NULL DEFAULT 'Pending',
            approved_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `).run();

    // Safe migrations for accounts created by the earlier email-only version.
    ensureColumn(db, "customer_users", "medical_name", "TEXT NOT NULL DEFAULT ''");
    ensureColumn(db, "customer_users", "customer_name", "TEXT NOT NULL DEFAULT ''");
    ensureColumn(db, "customer_users", "mobile", "TEXT NOT NULL DEFAULT ''");
    ensureColumn(db, "customer_users", "approval_status", "TEXT NOT NULL DEFAULT 'Pending'");
    ensureColumn(db, "customer_users", "approved_at", "DATETIME");

    app.post("/api/auth/register", (req, res) => {
        try {
            const medicalName = String(req.body.medicalName || "").trim();
            const customerName = String(req.body.customerName || "").trim();
            const mobile = String(req.body.mobile || "").replace(/[\s-]/g, "");
            const email = String(req.body.email || "").trim().toLowerCase();
            const password = String(req.body.password || "");

            if (!medicalName || medicalName.length > 160 || !customerName || customerName.length > 120) {
                return res.status(400).json({ success: false, message: "Enter a valid medical store name and customer name." });
            }
            if (!/^\+?[0-9]{10,15}$/.test(mobile)) {
                return res.status(400).json({ success: false, message: "Enter a valid mobile number (10–15 digits)." });
            }
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
                return res.status(400).json({ success: false, message: "Please enter a valid email address." });
            }
            if (password.length < 8 || password.length > 128) {
                return res.status(400).json({ success: false, message: "Password must be 8 to 128 characters long." });
            }

            const { salt, hash } = hashPassword(password);
            const result = db.prepare(`
                INSERT INTO customer_users
                    (email, password_hash, password_salt, medical_name, customer_name, mobile, approval_status)
                VALUES (?, ?, ?, ?, ?, ?, 'Pending')
            `).run(email, hash, salt, medicalName, customerName, mobile);

            return res.status(201).json({
                success: true,
                status: "Pending",
                message: "Registration submitted. Your account is pending admin approval; you can log in after approval.",
                customer: { id: Number(result.lastInsertRowid), email, medicalName, customerName, mobile, approvalStatus: "Pending" }
            });
        } catch (error) {
            if (String(error && error.code) === "SQLITE_CONSTRAINT_UNIQUE") {
                return res.status(409).json({ success: false, message: "An account with this email already exists. Please log in." });
            }
            console.error("Customer registration failed:", error);
            return res.status(500).json({ success: false, message: "Unable to create account right now." });
        }
    });

    app.post("/api/auth/login", (req, res) => {
        try {
            const email = String(req.body.email || "").trim().toLowerCase();
            const password = String(req.body.password || "");
            if (!email || !password) {
                return res.status(400).json({ success: false, message: "Email and password are required." });
            }

            const user = db.prepare(`
                SELECT id, email, password_hash, password_salt, medical_name, customer_name, mobile, approval_status
                FROM customer_users WHERE email = ?
            `).get(email);

            if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) {
                return res.status(401).json({ success: false, message: "Invalid email or password." });
            }
            if (user.approval_status !== "Approved") {
                const status = user.approval_status === "Rejected" ? "Rejected" : "Pending";
                return res.status(403).json({
                    success: false,
                    status,
                    message: status === "Rejected"
                        ? "Your registration was not approved. Please contact Choudhary Medical."
                        : "Your account is awaiting admin approval. Please try again after it has been approved."
                });
            }

            req.session.regenerate((sessionError) => {
                if (sessionError) {
                    console.error("Customer session regeneration failed:", sessionError);
                    return res.status(500).json({ success: false, message: "Unable to sign in right now." });
                }
                req.session.customerId = user.id;
                req.session.customerEmail = user.email;
                return res.json({
                    success: true,
                    message: "Login successful.",
                    customer: {
                        id: user.id, email: user.email, medicalName: user.medical_name,
                        customerName: user.customer_name, mobile: user.mobile,
                        approvalStatus: user.approval_status
                    }
                });
            });
        } catch (error) {
            console.error("Customer login failed:", error);
            return res.status(500).json({ success: false, message: "Unable to sign in right now." });
        }
    });

    app.get("/api/auth/me", (req, res) => {
        if (!req.session || !req.session.customerId) {
            return res.status(401).json({ success: false, message: "Not logged in." });
        }
        const user = db.prepare(`
            SELECT id, email, medical_name, customer_name, mobile, approval_status
            FROM customer_users WHERE id = ?
        `).get(req.session.customerId);
        if (!user || user.approval_status !== "Approved") {
            req.session.customerId = null;
            req.session.customerEmail = null;
            return res.status(403).json({ success: false, message: "Customer account is not approved." });
        }
        return res.json({
            success: true,
            customer: {
                id: user.id, email: user.email, medicalName: user.medical_name,
                customerName: user.customer_name, mobile: user.mobile,
                approvalStatus: user.approval_status
            }
        });
    });

    // Admin-only customer approval endpoints use the existing admin session.
    app.get("/api/admin/customer-registrations", (req, res) => {
        if (!req.session || !req.session.isAdmin) {
            return res.status(401).json({ success: false, message: "Admin login required." });
        }
        const status = String(req.query.status || "Pending");
        if (!["Pending", "Approved", "Rejected", "All"].includes(status)) {
            return res.status(400).json({ success: false, message: "Invalid status filter." });
        }
        const customers = status === "All"
            ? db.prepare("SELECT id, medical_name AS medicalName, customer_name AS customerName, mobile, email, approval_status AS approvalStatus, created_at AS createdAt, approved_at AS approvedAt FROM customer_users ORDER BY id DESC").all()
            : db.prepare("SELECT id, medical_name AS medicalName, customer_name AS customerName, mobile, email, approval_status AS approvalStatus, created_at AS createdAt, approved_at AS approvedAt FROM customer_users WHERE approval_status = ? ORDER BY id DESC").all(status);
        return res.json({ success: true, customers });
    });

    app.post("/api/admin/customer-registrations/:id/status", (req, res) => {
        if (!req.session || !req.session.isAdmin) {
            return res.status(401).json({ success: false, message: "Admin login required." });
        }
        const id = Number(req.params.id);
        const status = String(req.body.status || "");
        if (!Number.isSafeInteger(id) || id < 1 || !["Approved", "Rejected", "Pending"].includes(status)) {
            return res.status(400).json({ success: false, message: "Invalid customer or status." });
        }
        const result = db.prepare(`
            UPDATE customer_users
            SET approval_status = ?, approved_at = CASE WHEN ? = 'Approved' THEN CURRENT_TIMESTAMP ELSE NULL END
            WHERE id = ?
        `).run(status, status, id);
        if (!result.changes) {
            return res.status(404).json({ success: false, message: "Customer account not found." });
        }
        return res.json({ success: true, message: `Customer status updated to ${status}.` });
    });

    app.post("/api/auth/logout", (req, res) => {
        if (!req.session) {
            return res.json({ success: true, message: "Logged out." });
        }
        req.session.customerId = null;
        req.session.customerEmail = null;
        req.session.save((saveError) => {
            if (saveError) {
                return res.status(500).json({ success: false, message: "Unable to log out right now." });
            }
            return res.json({ success: true, message: "Logged out successfully." });
        });
    });
}

module.exports = { registerCustomerAuth };
