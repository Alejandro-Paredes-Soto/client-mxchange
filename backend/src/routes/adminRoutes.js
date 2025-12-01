const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticate } = require('../middlewares/auth');
const { isAdmin } = require('../middlewares/isAdmin');
const { isSucursalOrAdmin } = require('../middlewares/isSucursalOrAdmin');

// Rutas accesibles tanto por admin como por sucursal
router.get('/inventory', authenticate, isSucursalOrAdmin, adminController.getInventory);
router.put('/inventory', authenticate, isSucursalOrAdmin, adminController.updateInventory);
router.get('/inventory/history/:branchId', authenticate, isSucursalOrAdmin, adminController.getInventoryHistory);
router.get('/transactions', authenticate, isSucursalOrAdmin, adminController.listAllTransactions);
router.put('/transactions/:id/status', authenticate, isSucursalOrAdmin, adminController.changeTransactionStatus);
router.get('/transactions/:id', authenticate, isSucursalOrAdmin, adminController.getTransactionDetails);
router.get('/dashboard/kpis', authenticate, isSucursalOrAdmin, adminController.getDashboardKPIs);
router.get('/dashboard/chart', authenticate, isSucursalOrAdmin, adminController.getDashboardChartData);
router.get('/dashboard/inventory-summary', authenticate, isSucursalOrAdmin, adminController.getInventorySummary);
router.get('/dashboard/recent-transactions', authenticate, isSucursalOrAdmin, adminController.getRecentTransactions);

// Rutas exclusivas de admin (gestión de usuarios, sucursales, tasas, etc.)
router.get('/users', authenticate, isAdmin, adminController.listUsers);
router.post('/users', authenticate, isAdmin, adminController.createUser);
router.get('/users/:id', authenticate, isAdmin, adminController.getUserProfile);
router.put('/users/:id/status', authenticate, isAdmin, adminController.toggleUserStatus);
router.put('/users/:id/role', authenticate, isAdmin, adminController.updateUserRole);
router.get('/config/rates', authenticate, isAdmin, adminController.getCurrentRates);
router.put('/config/rates', authenticate, isAdmin, adminController.updateRates);
router.get('/config/branches', authenticate, isAdmin, adminController.listBranches);
router.post('/config/branches', authenticate, isAdmin, adminController.createBranch);
router.put('/config/branches/:id', authenticate, isAdmin, adminController.updateBranch);
router.delete('/config/branches/:id', authenticate, isAdmin, adminController.deleteBranch);
router.get('/config/alerts', authenticate, isAdmin, adminController.getAlertSettings);
router.put('/config/alerts', authenticate, isAdmin, adminController.updateAlertSettings);
router.put('/config/commission', authenticate, isAdmin, adminController.updateCommissionSetting);

// Rutas de gestión de expiración (solo admin)
router.post('/expire-transactions/check', authenticate, isAdmin, adminController.runExpirationCheck);
router.get('/expire-transactions/settings', authenticate, isAdmin, adminController.getExpirationSettings);
router.put('/expire-transactions/settings', authenticate, isAdmin, adminController.updateExpirationSettings);

module.exports = router;
