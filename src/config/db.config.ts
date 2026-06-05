import mysql from 'mysql2/promise';

const dbHost = process.env.URL_DB || process.env.DB_HOST || 'localhost';
const dbPort = Number(process.env.PORT_DB || process.env.DB_PORT || 3306);
const dbUser = process.env.USER_DB || process.env.DB_USER || 'root';
const dbPassword = process.env.PASSWORD_DB || process.env.DB_PASSWORD || '';
const dbName = process.env.DB_NAME || 'bancard_vpos';

console.log(`[DB] Inicializando conexión para ${dbHost}:${dbPort} (BD: ${dbName})`);

export const dbPool = mysql.createPool({
  host: dbHost,
  port: dbPort,
  user: dbUser,
  password: dbPassword,
  database: dbName,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

export const checkDbConnection = async (): Promise<boolean> => {
  try {
    console.log(`[DB] Conectando a ${dbHost}:${dbPort}...`);
    const connection = await dbPool.getConnection();
    console.log('[DB] Conexión a MySQL establecida correctamente.');
    connection.release();
    return true;
  } catch (error) {
    console.error(`[DB] Error al conectar a MySQL en ${dbHost}:${dbPort}. Verifica las credenciales en .env:`, error);
    return false;
  }
};
