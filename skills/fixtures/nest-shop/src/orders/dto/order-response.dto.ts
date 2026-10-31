export class OrderResponseDto {
  ref!: string;
  state!: string;
  amount!: number;

  static from(order: { id: string; state: string; amount: number }): OrderResponseDto {
    return { ref: order.id, state: order.state, amount: order.amount };
  }
}
