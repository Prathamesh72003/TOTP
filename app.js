const express = require("express");
const bodyParser = require("body-parser");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const { initDb } = require("./database");
const { VsAuthenticator } = require("@vs-org/authenticator");
const cookieParser = require("cookie-parser");
const csrf = require("csurf");
const session = require("express-session");

const app = express();
const PORT = 4000;

app.use(express.static('public'));

const TotpSecret = "3P3P3DKJBEHPSWY";

app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use(session({
    secret: 'supersecrethaha',
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 1000 * 60 * 60
    }
}));

const csrfProtection = csrf({ cookie: true });

function isAuthenticatedMiddleware(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.redirect("/?error=Please login first");
    }
    next();
}

function isTotpVerifiedMiddleware(req, res, next) {
    if (!req.session || !req.session.user || !req.session.totpVerified) {
        return res.redirect("/totp?error=Please verify TOTP first");
    }
    next();
}

initDb();

app.get("/", csrfProtection, (req, res) => {
    if (req.session.user && req.session.totpVerified) {
        return res.redirect("/flag");
    }
    if (req.session.user) {
        return res.redirect("/totp");
    }
    
    const error = req.query.error || "";
    const csrfToken = req.csrfToken();

    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Login</title>
            <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
            <style>
                body {
                    background-color: #f8f9fa;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                }
                .login-box {
                    background: white;
                    border-radius: 10px;
                    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
                    padding: 20px;
                    max-width: 400px;
                    width: 100%;
                }
                .login-title {
                    font-size: 1.5rem;
                    font-weight: bold;
                    text-align: center;
                }
                .error {
                    color: red;
                    margin-top: 10px;
                    text-align: center;
                }
            </style>
        </head>
        <body>
            <div class="login-box">
                <h1 class="login-title">Login</h1>
                <form method="POST" action="/" class="mt-3">
                    <div class="mb-3">
                        <label for="username" class="form-label">Username</label>
                        <input type="text" class="form-control" id="username" name="username" required>
                    </div>
                    <div class="mb-3">
                        <label for="password" class="form-label">Password</label>
                        <input type="password" class="form-control" id="password" name="password" required>
                    </div>
                    <input type="hidden" name="_csrf" value="${csrfToken}">
                    <button type="submit" class="btn btn-primary w-100">Login</button>
                </form>
                ${error ? `<div class="error">${error}</div>` : ""}
            </div>
        </body>
        </html>
    `);
});

app.post("/", csrfProtection, (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.redirect(`/?error=Username or password is missing.`);
    }

    const query = `SELECT * FROM users WHERE username = '${username}' AND password = '${password}'`;
    const db = new sqlite3.Database("challenge.db");
    
    db.get(query, (err, row) => {
        if (err) {
            return res.redirect(`/?error=An error occurred: ${err.message}`);
        }

        if (row) {
            req.session.user = { username: row.username };
            req.session.totpVerified = false;
            res.redirect("/totp");
        } else {
            res.redirect(`/?error=Invalid credentials!`);
        }

        db.close();
    });
});

app.get("/totp", csrfProtection, isAuthenticatedMiddleware, (req, res) => {
    if (req.session.totpVerified) {
        return res.redirect("/flag");
    }

    const error = req.query.error || "";
    const csrfToken = req.csrfToken();

    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Enter TOTP</title>
            <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
            <style>
                body {
                    background-color: #f8f9fa;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                }
                .totp-box {
                    background: white;
                    border-radius: 10px;
                    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
                    padding: 20px;
                    max-width: 400px;
                    width: 100%;
                }
                .totp-title {
                    font-size: 1.5rem;
                    font-weight: bold;
                    text-align: center;
                }
                .error {
                    color: red;
                    margin-top: 10px;
                    text-align: center;
                }
            </style>
        </head>
        <body>
            <div class="totp-box">
                <h1 class="totp-title">Enter TOTP</h1>
                <form method="POST" action="/totp" class="mt-3">
                    <div class="mb-3">
                        <label for="totp" class="form-label">TOTP</label>
                        <input type="text" class="form-control" id="totp" name="totp" required>
                    </div>
                    <input type="hidden" name="_csrf" value="${csrfToken}">
                    <button type="submit" class="btn btn-primary w-100">Verify</button>
                </form>
                ${error ? `<div class="error">${error}</div>` : ""}
            </div>

            <script src="/totp.js"></script>
        </body>
        </html>
    `);
});

app.post("/totp", csrfProtection, isAuthenticatedMiddleware, (req, res) => {
    const { totp } = req.body;
    const generatedTotp = VsAuthenticator.generateTOTP(TotpSecret);

    if (totp === generatedTotp) {
        req.session.totpVerified = true;
        res.redirect("/flag");
    } else {
        res.redirect(`/totp?error=Invalid TOTP. Please try again.`);
    }
});

app.get("/flag", csrfProtection, isAuthenticatedMiddleware, isTotpVerifiedMiddleware, (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Flag</title>
            <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
        </head>
        <body>
            <div class="container mt-5">
                <h1 class="text-center">Welcome, ${req.session.user.username}</h1>
                <p class="text-center">You have successfully verified your TOTP.</p>
                <p>Success! Flag: CUB{SQLi-f0r_th3_w1n-324328749328749}</p>
                
                <!-- Logout Button -->
                <form method="GET" action="/logout">
                    <button type="submit" class="btn btn-danger w-100">Logout</button>
                </form>
            </div>
        </body>
        </html>
    `);
});


app.get("/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.redirect("/?error=Failed to logout.");
        }
        res.redirect("/"); 
    });
});

app.listen(PORT, '127.0.0.1',() => {
    console.log(`Server is running on http://127.0.0.1:${PORT}`);
});