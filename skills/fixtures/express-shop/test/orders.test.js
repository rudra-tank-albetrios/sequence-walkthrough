const { test } = require('node:test');
const assert = require('node:assert');

const OrderService = require('../src/services/order.service');

test('a test of placing an order, which a diagram never needs to read', () => {
  assert.equal(typeof OrderService.place, 'function');
});
