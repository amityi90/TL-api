const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const adminAuth = require('../middleware/adminAuth');

// Apply adminAuth middleware to all routes
router.use(adminAuth);

// Product Management
router.post('/products', adminController.createProduct);
router.get('/products', adminController.getAllProducts);
router.put('/products/:id', adminController.updateProduct);
router.delete('/products/:id', adminController.deleteProduct);

// Order Pipeline
router.get('/orders', adminController.getAllOrders);
router.patch('/orders/:id/ship', adminController.shipOrder);
router.patch('/orders/:id/arrive', adminController.arriveOrder);
router.patch('/orders/:id/archive', adminController.archiveOrder);

module.exports = router;
