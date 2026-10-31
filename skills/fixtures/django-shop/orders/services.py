from django.db import transaction

from .models import Item, Order


class OutOfStock(Exception):
    pass


@transaction.atomic
def place_order(customer_id, item_code, amount):
    item = Item.objects.select_for_update().filter(code=item_code).first()
    if item is None or item.on_hand < amount:
        raise OutOfStock()
    item.on_hand -= amount
    item.save()
    return Order.objects.create(
        customer_id=customer_id,
        item=item,
        amount=amount,
        grand_total=item.price * amount,
    )
