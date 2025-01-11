const sqlite3 = require('sqlite3').verbose();

function initDb() {
  const db = new sqlite3.Database('challenge.db');
  db.serialize(() => {
    db.run(
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        username TEXT,
        password TEXT
      )`
    );

    db.run(
      `INSERT OR IGNORE INTO users (username, password) 
       VALUES ('admin', 'supersecret-59032840i32984')`
    );
  });
  db.close();
}

module.exports = { initDb };
