import mysql from 'mysql2/promise';

export const dbPool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'bancard_vpos',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

export const checkDbConnection = async (): Promise<boolean> => {
  try {
    const connection = await dbPool.getConnection();
    console.log('[DB] Conexión a MySQL establecida correctamente.');
    connection.release();
    return true;
  } catch (error) {
    console.error('[DB] Error al conectar a MySQL. Verifica las credenciales en .env:', error);
    return false;
  }
};
