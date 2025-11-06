const pool = require('../config/db');

const listNotifications = async (req, res, next) => {
  try {
    const user = req.user || {};
    const userId = user.id || user.idUser || null;
    
    // Determinar el rol del usuario
    let userRole = String(user.role || user.rol || '').toLowerCase();
    let userBranchId = user.branch_id || null;
    
    // Si no tenemos rol o branch_id en el token, consultar la BD
    if (!userRole || (userRole === 'sucursal' && !userBranchId)) {
      if (userId) {
        const [userRows] = await pool.query('SELECT role, branch_id FROM users WHERE idUser = ?', [userId]);
        if (userRows && userRows[0]) {
          userRole = String(userRows[0].role || '').toLowerCase();
          userBranchId = userRows[0].branch_id;
        }
      }
    }

    let rows = [];
    
    if (userRole === 'admin') {
      // Admins ven todas las notificaciones para admins
      const [r] = await pool.query(
        'SELECT id, recipient_role, recipient_user_id, branch_id, title, message, event_type, transaction_id, read_at, created_at FROM notifications WHERE recipient_role = ? ORDER BY created_at DESC LIMIT 100',
        ['admin']
      );
      rows = r;
    } else if (userRole === 'sucursal' && userBranchId) {
      // Usuarios de sucursal ven notificaciones de su sucursal
      const [r] = await pool.query(
        'SELECT id, recipient_role, recipient_user_id, branch_id, title, message, event_type, transaction_id, read_at, created_at FROM notifications WHERE recipient_role = ? AND branch_id = ? ORDER BY created_at DESC LIMIT 100',
        ['sucursal', userBranchId]
      );
      rows = r;
    } else if (userId) {
      // Clientes ven solo sus notificaciones personales
      const [r] = await pool.query(
        'SELECT id, recipient_role, recipient_user_id, branch_id, title, message, event_type, transaction_id, read_at, created_at FROM notifications WHERE recipient_role = ? AND recipient_user_id = ? ORDER BY created_at DESC LIMIT 100',
        ['user', userId]
      );
      rows = r;
    } else {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    return res.json({ notifications: rows });
  } catch (err) {
    next(err);
  }
};

const markAllAsRead = async (req, res, next) => {
  try {
    console.log('[markAllAsRead] Iniciando...');
    const user = req.user || {};
    const userId = user.id || user.idUser || null;
    
    // Determinar el rol del usuario
    let userRole = String(user.role || user.rol || '').toLowerCase();
    let userBranchId = user.branch_id || null;
    
    console.log('[markAllAsRead] Usuario:', { userId, userRole, userBranchId });
    
    // Si no tenemos rol o branch_id en el token, consultar la BD
    if (!userRole || (userRole === 'sucursal' && !userBranchId)) {
      if (userId) {
        const [userRows] = await pool.query('SELECT role, branch_id FROM users WHERE idUser = ?', [userId]);
        if (userRows && userRows[0]) {
          userRole = String(userRows[0].role || '').toLowerCase();
          userBranchId = userRows[0].branch_id;
          console.log('[markAllAsRead] Rol actualizado desde BD:', { userRole, userBranchId });
        }
      }
    }

    let result;
    if (userRole === 'admin') {
      console.log('[markAllAsRead] Marcando notificaciones de admin...');
      result = await pool.query('UPDATE notifications SET read_at = NOW() WHERE recipient_role = ? AND read_at IS NULL', ['admin']);
      console.log('[markAllAsRead] Notificaciones admin marcadas:', result[0].affectedRows);
    } else if (userRole === 'sucursal' && userBranchId) {
      console.log('[markAllAsRead] Marcando notificaciones de sucursal:', userBranchId);
      result = await pool.query('UPDATE notifications SET read_at = NOW() WHERE recipient_role = ? AND branch_id = ? AND read_at IS NULL', ['sucursal', userBranchId]);
      console.log('[markAllAsRead] Notificaciones sucursal marcadas:', result[0].affectedRows);
    } else if (userId) {
      console.log('[markAllAsRead] Marcando notificaciones de usuario:', userId);
      result = await pool.query('UPDATE notifications SET read_at = NOW() WHERE recipient_role = ? AND recipient_user_id = ? AND read_at IS NULL', ['user', userId]);
      console.log('[markAllAsRead] Notificaciones usuario marcadas:', result[0].affectedRows);
    } else {
      console.log('[markAllAsRead] Sin autorización');
      return res.status(401).json({ message: 'Unauthorized' });
    }

    return res.json({ ok: true, affectedRows: result[0].affectedRows });
  } catch (err) {
    console.error('[markAllAsRead] Error:', err);
    next(err);
  }
};

module.exports = { listNotifications, markAllAsRead };

