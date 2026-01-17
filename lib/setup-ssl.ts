import fs from 'fs';
import path from 'path';

if (process.env.DB_CA_CERT) {
  const certPath = path.resolve('./vercel-db-ca.crt');
  const certData = Buffer.from(process.env.DB_CA_CERT, 'base64').toString('utf8');
  fs.writeFileSync(certPath, certData, { encoding: 'utf8' });

  // Tell Node to use this certificate for SSL
  process.env.NODE_EXTRA_CA_CERTS = certPath;
}