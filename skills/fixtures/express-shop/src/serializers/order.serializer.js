function serializeOrder(order) {
  return { id: order.id, status: order.status, total: order.total };
}

module.exports = { serializeOrder };
