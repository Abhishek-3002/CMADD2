const session = require("express-session");

class SQLiteSessionStore extends session.Store {
    constructor(database) {
        super();
        this.getStatement = database.prepare("SELECT sess, expires FROM web_sessions WHERE sid = ?");
        this.setStatement = database.prepare("INSERT INTO web_sessions (sid, sess, expires) VALUES (?, ?, ?) ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires = excluded.expires");
        this.destroyStatement = database.prepare("DELETE FROM web_sessions WHERE sid = ?");
        this.touchStatement = database.prepare("UPDATE web_sessions SET expires = ? WHERE sid = ?");
        this.pruneStatement = database.prepare("DELETE FROM web_sessions WHERE expires <= ?");
    }
    get(sid, callback) {
        try {
            const row = this.getStatement.get(sid);
            if (!row) return callback(null, null);
            if (row.expires <= Date.now()) {
                this.destroyStatement.run(sid);
                return callback(null, null);
            }
            callback(null, JSON.parse(row.sess));
        } catch (error) { callback(error); }
    }
    set(sid, sess, callback = () => {}) {
        try {
            const expires = sess.cookie && sess.cookie.expires
                ? new Date(sess.cookie.expires).getTime()
                : Date.now() + 8 * 60 * 60 * 1000;
            this.setStatement.run(sid, JSON.stringify(sess), expires);
            callback(null);
        } catch (error) { callback(error); }
    }
    destroy(sid, callback = () => {}) {
        try { this.destroyStatement.run(sid); callback(null); }
        catch (error) { callback(error); }
    }
    touch(sid, sess, callback = () => {}) {
        try {
            const expires = sess.cookie && sess.cookie.expires
                ? new Date(sess.cookie.expires).getTime()
                : Date.now() + 8 * 60 * 60 * 1000;
            this.touchStatement.run(expires, sid);
            callback(null);
        } catch (error) { callback(error); }
    }
}

module.exports = { SQLiteSessionStore };
