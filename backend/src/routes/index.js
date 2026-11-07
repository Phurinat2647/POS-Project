const router = require('express').Router();

router.use('/health', require('./health.routes'));
router.use('/auth', require('./auth.routes'));

// Phase 2+: users, categories, menus, orders, payments, ingredients, reports

module.exports = router;
