from rest_framework import serializers

from .models import Order


class NewOrderSerializer(serializers.Serializer):
    item_code = serializers.CharField()
    amount = serializers.IntegerField(min_value=1)


class OrderSerializer(serializers.ModelSerializer):
    class Meta:
        model = Order
        fields = ['reference', 'state', 'grand_total']
