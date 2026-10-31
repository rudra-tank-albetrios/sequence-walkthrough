from django.urls import include, path

urlpatterns = [
    path('api/', include('orders.urls')),
    path('reports/', include('reports.urls')),
]
