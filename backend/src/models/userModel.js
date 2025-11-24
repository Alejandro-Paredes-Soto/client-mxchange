const pool = require('../config/db');


const findByEmail = async (email) => {
  const [rows] = await pool.query('SELECT idUser, email, password, name, role, branch_id, active, auth_provider, createdAt FROM users WHERE email = ?', [email]);
  return rows[0];
};

const createUser = async ({ name, email, password, role = 'client', branch_id = null, auth_provider = 'email' }) => {
  const [result] = await pool.query('INSERT INTO users (name, email, password, role, branch_id, auth_provider) VALUES (?, ?, ?, ?, ?, ?)', [name, email, password, role, branch_id, auth_provider]);
  // Retornar el usuario completo después de la inserción
  const [rows] = await pool.query('SELECT idUser, email, password, name, role, branch_id, active, auth_provider, createdAt FROM users WHERE idUser = ?', [result.insertId]);
  return rows[0];
};

const updatePassword = async (email, hashedPassword) => {
  const [result] = await pool.query('UPDATE users SET password = ? WHERE email = ?', [hashedPassword, email]);
  return result.affectedRows > 0;
};

module.exports = { findByEmail, createUser, updatePassword };
