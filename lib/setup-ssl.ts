import fs from 'fs';
import path from 'path';

if (process.env.DB_CA_CERT) {
  const certData = Buffer.from(process.env.DB_CA_CERT, 'base64').toString('utf8');

  // Use /tmp for Vercel, writable at runtime
  const certPath = path.join('/tmp', 'vercel-db-ca.crt');
  fs.writeFileSync(certPath, certData, { encoding: 'utf8' });

  // Tell Node to use this cert for SSL
  process.env.NODE_EXTRA_CA_CERTS = certPath;

  console.log('[SSL] Certificate written to', certPath);
  console.log('NODE_EXTRA_CA_CERTS:', process.env.NODE_EXTRA_CA_CERTS);
  console.log('DB_CA_CERT length:', process.env.DB_CA_CERT?.length);
}