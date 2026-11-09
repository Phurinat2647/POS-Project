const router = require('express').Router();

router.use('/health', require('./health.routes'));
router.use('/auth', require('./auth.routes'));
router.use('/dashboard', require('./dashboard.routes'));
router.use('/categories', require('./category.routes'));
router.use('/menus', require('./menu.routes'));
router.use('/menu-options', require('./menuOption.routes'));
router.use('/pos', require('./pos.routes'));
router.use('/orders', require('./order.routes'));

// Phase 4+: payments, ingredients, reports

module.exports = router;
