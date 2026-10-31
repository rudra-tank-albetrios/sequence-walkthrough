INSTALLED_APPS = [
    'django.contrib.contenttypes',
    'rest_framework',
    'orders',
    'reports',
]

MIDDLEWARE = [
    'django.middleware.common.CommonMiddleware',
    'orders.middleware.SessionTokenMiddleware',
]

ROOT_URLCONF = 'shop.urls'

DATABASES = {'default': {'ENGINE': 'django.db.backends.postgresql', 'NAME': 'shop'}}
