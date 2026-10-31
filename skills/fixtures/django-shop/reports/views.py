from django.http import JsonResponse


def sales(request):
    # The sales report. Not part of placing an order.
    return JsonResponse({'total': 0})
