/* Create an admin, or reset the password of an existing one.
   Usage: npm run create-admin -- <username> "<Full Name>" <password>
   The first admin also takes ownership of articles created before admin login existed. */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const { sql, getPool } = require('../src/db');

async function main() {
  const [username, fullName, password] = process.argv.slice(2);
  if (!username || !fullName || !password) {
    console.log('Usage: npm run create-admin -- <username> "<Full Name>" <password>');
    process.exit(1);
  }
  if (password.length < 8) {
    console.log('Password must be at least 8 characters.');
    process.exit(1);
  }

  const pool = await getPool();
  const hash = await bcrypt.hash(password, 12);
  const r = await pool.request()
    .input('u', sql.NVarChar(100), username.trim())
    .input('n', sql.NVarChar(200), fullName.trim())
    .input('h', sql.NVarChar(200), hash)
    .query(`
      IF EXISTS (SELECT 1 FROM dbo.AdminUsers WHERE Username = @u)
      BEGIN
        UPDATE dbo.AdminUsers SET FullName = @n, PasswordHash = @h, IsActive = 1 WHERE Username = @u;
        SELECT AdminId, CAST(0 AS BIT) AS Created FROM dbo.AdminUsers WHERE Username = @u;
      END
      ELSE
      BEGIN
        INSERT INTO dbo.AdminUsers (Username, FullName, PasswordHash) VALUES (@u, @n, @h);
        SELECT CAST(SCOPE_IDENTITY() AS INT) AS AdminId, CAST(1 AS BIT) AS Created;
      END`);
  const { AdminId, Created } = r.recordset[0];

  const orphans = await pool.request().input('u', sql.Int, AdminId)
    .query('UPDATE dbo.Articles SET CreatedBy = @u WHERE CreatedBy IS NULL; SELECT @@ROWCOUNT AS N;');

  console.log(Created ? `Admin "${username}" created.` : `Password reset for "${username}".`);
  if (orphans.recordset[0].N) console.log(`Assigned ${orphans.recordset[0].N} older article(s) to "${username}".`);
  await pool.close();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
