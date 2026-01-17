import fs from 'fs';
import path from 'path';

if (process.env.DB_CA_CERT) {
  // Decode the base64 certificate
  const certData = Buffer.from(process.env.DB_CA_CERT, 'base64').toString('utf8');

  // Use /tmp, which is writable in Vercel serverless functions
  const certPath = path.join('/tmp', 'vercel-db-ca.crt');
  fs.writeFileSync(certPath, certData, { encoding: 'utf8' });

  // Tell Node to use this certificate for SSL
  process.env.NODE_EXTRA_CA_CERTS = certPath;

  console.log('SSL certificate written to', certPath);
}