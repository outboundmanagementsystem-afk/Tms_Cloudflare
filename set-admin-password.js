// One-off: set an email+password admin login. Hashes with the SAME scheme the app
// uses (PBKDF2-HMAC-SHA256, 100k iters, 16-byte salt, 32-byte key) so /api/auth/login verifies it.
//   node set-admin-password.js <email> <password>
const crypto = require("crypto")
const { execSync } = require("child_process")

const email = (process.argv[2] || "").toLowerCase()
const password = process.argv[3]
if (!email || !password) {
  console.error("Usage: node set-admin-password.js <email> <password>")
  process.exit(1)
}

const salt = crypto.randomBytes(16)
const hash = crypto.pbkdf2Sync(password, salt, 100000, 32, "sha256")
const stored = `pbkdf2$100000$${salt.toString("base64")}$${hash.toString("base64")}`

const sql = `UPDATE users SET password_hash='${stored}', updated_at='${new Date().toISOString()}' WHERE email='${email}';`
execSync(`npx wrangler d1 execute outbound-tms --remote --yes --command "${sql}"`, { stdio: "inherit" })
console.log(`\n✓ Password set for ${email}\n  password: ${password}\n  (change it after first login)`)
