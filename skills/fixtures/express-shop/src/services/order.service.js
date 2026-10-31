const OrderRepository = require('../repositories/order.repository');
const { OutOfStockError } = require('../errors');

async function place(userId, { productId, quantity }) {
  const product = await OrderRepository.findProduct(productId);
  if (!product || product.stock < quantity) {
    throw new OutOfStockError('Not enough stock');
  }
  return OrderRepository.insert({
    userId,
    productId,
    quantity,
    total: product.price * quantity,
  });
}

function find(id) {
  return OrderRepository.findById(id);
}

module.exports = { place, find };
