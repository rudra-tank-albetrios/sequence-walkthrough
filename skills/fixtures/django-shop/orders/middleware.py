from django.http import JsonResponse

SESSIONS = {}


class SessionTokenMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        token = request.headers.get('X-Session', '')
        if request.path.startswith('/api/') and token not in SESSIONS:
            return JsonResponse({'detail': 'Session required'}, status=401)
        request.customer_id = SESSIONS.get(token)
        return self.get_response(request)
