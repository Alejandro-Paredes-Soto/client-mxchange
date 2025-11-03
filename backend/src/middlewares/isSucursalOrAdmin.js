const pool = require('../config/db');

/**
 * Middleware para verificar que el usuario es admin o sucursal
 * Los usuarios con rol 'sucursal' solo pueden ver datos de su sucursal asignada
 * Los usuarios con rol 'admin' pueden ver datos de todas las sucursales
 */
async function isSucursalOrAdmin(req, res, next) {
  try {
    const userId = req.user && req.user.id ? req.user.id : null;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    
    const [rows] = await pool.query('SELECT role, branch_id FROM users WHERE idUser = ?', [userId]);
    const user = rows && rows[0] ? rows[0] : null;
    
    if (!user) return res.status(403).json({ message: 'User not found' });
    
    const role = user.role;
    const branchId = user.branch_id;
    
    // Verificar que sea admin o sucursal
    if (role !== 'admin' && role !== 'sucursal') {
      return res.status(403).json({ message: 'Access denied. Admin or branch access required.' });
    }
    
    // Si es sucursal, verificar que tenga una sucursal asignada
    if (role === 'sucursal' && !branchId) {
      return res.status(403).json({ message: 'Branch not assigned to user' });
    }
    
    // Agregar información del usuario al request para uso posterior
    req.userRole = role;
    req.userBranchId = branchId;
    
    return next();
  } catch (err) {
    return res.status(500).json({ message: 'Internal server error' });
  }
}

module.exports = { isSucursalOrAdmin };
