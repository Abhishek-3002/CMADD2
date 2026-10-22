const crypto = require("crypto");

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
    const hash = crypto.scryptSync(password, salt, 64).toString("hex");
    return { salt, hash };
}

function verifyPassword(password, salt, expectedHash) {
    const actual = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(expectedHash, "hex");
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function registerCustomerAuth(app, db) {
    db.prepare(`
        CREATE TABLE IF NOT EXISTS customer_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            password_salt TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `).run();

    app.post("/api/auth/register", (req, res) => {
        try {
            const email = String(req.body.email || "").trim().toLowerCase();
            const password = String(req.body.password || "");

            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                return res.status(400).json({ success: false, message: "Please enter a valid email address." });
            }
            if (password.length < 8 || password.length > 128) {
                return res.status(400).json({ success: false, message: "Password must be 8 to 128 characters long." });
            }

            const existing = db.prepare("SELECT id FROM customer_users WHERE email = ?").get(email);
            if (existing) {
                return res.status(409).json({ success: false, message: "An account with this email already exists. Please log in." });
            }

            const { salt, hash } = hashPassword(password);
            const result = db.prepare(
                "INSERT INTO customer_users (email, password_hash, password_salt) VALUES (?, ?, ?)"
            ).run(email, hash, salt);

            req.session.regenerate((sessionError) => {
                if (sessionError) {
                    console.error("Customer session regeneration failed:", sessionError);
                    return res.status(500).json({ success: false, message: "Account created, but sign-in failed. Please log in." });
                }
                req.session.customerId = Number(result.lastInsertRowid);
                req.session.customerEmail = email;
                return res.status(201).json({
                    success: true,
                    message: "Account created successfully.",
                    customer: { id: Number(result.lastInsertRowid), email }
                });
            });
        } catch (error) {
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

            const user = db.prepare(
                "SELECT id, email, password_hash, password_salt FROM customer_users WHERE email = ?"
            ).get(email);

            if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) {
                return res.status(401).json({ success: false, message: "Invalid email or password." });
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
                    customer: { id: user.id, email: user.email }
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
        res.json({
            success: true,
            customer: { id: req.session.customerId, email: req.session.customerEmail }
        });
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
            res.json({ success: true, message: "Logged out successfully." });
        });
    });
}

module.exports = { registerCustomerAuth };
