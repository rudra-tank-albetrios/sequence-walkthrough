from rest_framework.decorators import api_view
from rest_framework.response import Response

from .serializers import NewOrderSerializer, OrderSerializer
from .services import OutOfStock, place_order


@api_view(['POST'])
def create_order(request):
    incoming = NewOrderSerializer(data=request.data)
    if not incoming.is_valid():
        return Response({'errors': incoming.errors}, status=400)
    try:
        order = place_order(request.customer_id, **incoming.validated_data)
    except OutOfStock:
        return Response({'detail': 'No stock left'}, status=409)
    return Response(OrderSerializer(order).data, status=201)
