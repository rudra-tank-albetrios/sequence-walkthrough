const createOrderSchema = {
  check(body) {
    if (!Number.isInteger(body.productId)) {
      return 'productId must be a whole number';
    }
    if (!Number.isInteger(body.quantity) || body.quantity < 1) {
      return 'quantity must be at least 1';
    }
    return null;
  },
};

module.exports = { createOrderSchema };
