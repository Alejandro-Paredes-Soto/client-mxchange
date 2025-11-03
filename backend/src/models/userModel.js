const pool = require('../config/db');


const findByEmail = async (email) => {
  const [rows] = await pool.query('SELECT idUser, email, password, name, role, branch_id, active, createdAt FROM users WHERE email = ?', [email]);
  return rows[0];
};

const createUser = async ({ name, email, password, role = 'client', branch_id = null }) => {
  const [result] = await pool.query('INSERT INTO users (name, email, password, role, branch_id) VALUES (?, ?, ?, ?, ?)', [name, email, password, role, branch_id]);
  // Retornar el usuario completo después de la inserción
  const [rows] = await pool.query('SELECT idUser, email, password, name, role, branch_id, active, createdAt FROM users WHERE idUser = ?', [result.insertId]);
  return rows[0];
};

module.exports = { findByEmail, createUser };
