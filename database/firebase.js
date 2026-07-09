import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (!admin.apps.length) {
  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;

  if (FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY) {
    const privateKey = FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: FIREBASE_PROJECT_ID,
        clientEmail: FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey
      })
    });
    console.log('[database] Firebase Admin SDK inicializado desde variables de entorno.');
  } else {
    // Intentar buscar archivo de credenciales local
    const localKeyPath = path.resolve(__dirname, '../config/firebase-service-account.json');
    const sharedKeyPath = '/home/larita/Documentos/FLUX-MCP-DOC/Paginas-web/Panel de control/config/firebase-service-account.json';
    
    let keyPath = null;
    if (fs.existsSync(localKeyPath)) {
      keyPath = localKeyPath;
    } else if (fs.existsSync(sharedKeyPath)) {
      keyPath = sharedKeyPath;
    }

    if (keyPath) {
      try {
        const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
        console.log(`[database] Firebase Admin SDK inicializado usando credenciales de: ${keyPath}`);
      } catch (err) {
        console.error('[database] Error al cargar credenciales de archivo local:', err);
      }
    } else {
      console.warn('[database] No se configuraron credenciales de Firebase. Operando sin base de datos en la nube.');
    }
  }
}

export const db = admin.apps.length ? admin.firestore() : null;
export default db;
