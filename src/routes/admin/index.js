const express = require('express');
const { authMiddleware } = require('../../auth');
const router = express.Router();

// Apply auth to all admin routes
router.use(authMiddleware);

// Mount sub-routers
router.use('/', require('./users'));
router.use('/', require('./personas'));
router.use('/', require('./integrations'));
router.use('/', require('./knowledge'));
router.use('/', require('./skills'));
router.use('/', require('./bots'));
router.use('/', require('./agent'));
router.use('/', require('./goals'));
router.use('/', require('./stages'));
router.use('/', require('./orgmemory'));
router.use('/', require('./gamification'));
router.use('/', require('./cognitive'));
router.use('/', require('./blueprints'));
router.use('/', require('./events'));
router.use('/', require('./settings'));
router.use('/', require('./surveys'));
router.use('/', require('./misc'));

module.exports = router;
