const OrderService = require('../services/order.service');
const { serializeOrder } = require('../serializers/order.serializer');

async function create(req, res, next) {
  try {
    const order = await OrderService.place(req.user.id, req.body);
    return res.status(201).json(serializeOrder(order));
  } catch (err) {
    return next(err);
  }
}

async function show(req, res, next) {
  try {
    const order = await OrderService.find(req.params.id);
    return res.json(serializeOrder(order));
  } catch (err) {
    return next(err);
  }
}

module.exports = { create, show };
