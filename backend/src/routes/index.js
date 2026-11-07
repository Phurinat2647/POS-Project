const router = require('express').Router();

router.use('/health', require('./health.routes'));

// Phase 2+: auth, users, categories, menus, orders, payments, ingredients, reports

module.exports = router;
