
from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import LoginView, CurrentUserView,RegisterView

urlpatterns = [
    path("login/", LoginView.as_view(), name="login"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    path("me/", CurrentUserView.as_view(), name="current-user"),
    path("register/", RegisterView.as_view(), name="register"),
]
