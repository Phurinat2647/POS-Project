const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const ctrl = require('../controllers/auth.controller');
const { authenticate } = require('../middlewares/auth');
const loginLimiter = require('../middlewares/loginLimiter');

router.post('/login', loginLimiter, asyncHandler(ctrl.login));
router.get('/me', authenticate, asyncHandler(ctrl.me));
router.put('/change-password', authenticate, asyncHandler(ctrl.changePassword));

module.exports = router;
