// One-time: give every passwordless user a temporary login password.
// Only updates users whose password_hash is empty/NULL — never overwrites an
// existing password (admins or anyone who already set their own). Same PBKDF2
// format the app verifies. Users should change it after first login.
//   node bulk-seed-passwords.js [tempPassword]
const crypto = require("crypto")
const { execSync } = require("child_process")

const password = process.argv[2]
if (!password) {
  console.error("Usage: node bulk-seed-passwords.js <tempPassword>")
  process.exit(1)
}
const salt = crypto.randomBytes(16)
const hash = crypto.pbkdf2Sync(password, salt, 100000, 32, "sha256")
const stored = `pbkdf2$100000$${salt.toString("base64")}$${hash.toString("base64")}`

const sql = `UPDATE users SET password_hash='${stored}', updated_at='${new Date().toISOString()}' WHERE password_hash IS NULL OR password_hash='';`
const out = execSync(`npx wrangler d1 execute outbound-tms --remote --yes --command "${sql}"`, { encoding: "utf8" })
const m = out.match(/"rows_written":\s*(\d+)/)
console.log(`\n✓ Temporary password set for ${m ? m[1] : "?"} passwordless user(s)`)
console.log(`  password: ${password}\n  (ask each user to change it after first login)`)
