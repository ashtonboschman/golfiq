import fs from 'fs';
import path from 'path';

if (process.env.DB_CA_CERT) {
  const certData = Buffer.from(process.env.DB_CA_CERT, 'base64').toString('utf8');

  const certPath = path.join('/tmp', 'vercel-db-ca.crt');
  fs.writeFileSync(certPath, certData, { encoding: 'utf8' });

  process.env.NODE_EXTRA_CA_CERTS = certPath;

  console.log('[SSL] Certificate written to', certPath);
}