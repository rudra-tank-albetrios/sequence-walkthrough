from django.db import models


class Item(models.Model):
    code = models.CharField(max_length=20, unique=True)
    price = models.IntegerField()
    on_hand = models.IntegerField()


class Order(models.Model):
    reference = models.UUIDField(auto_created=True)
    customer_id = models.IntegerField()
    item = models.ForeignKey(Item, on_delete=models.PROTECT)
    amount = models.IntegerField()
    grand_total = models.IntegerField()
    state = models.CharField(max_length=10, default='received')
