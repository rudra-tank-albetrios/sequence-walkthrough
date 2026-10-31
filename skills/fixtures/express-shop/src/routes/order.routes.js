const { Router } = require('express');

const { authenticate } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate.middleware');
const { createOrderSchema } = require('../validators/order.validator');
const OrderController = require('../controllers/order.controller');

const router = Router();

router.post('/', authenticate, validate(createOrderSchema), OrderController.create);
router.get('/:id', authenticate, OrderController.show);

module.exports = router;
