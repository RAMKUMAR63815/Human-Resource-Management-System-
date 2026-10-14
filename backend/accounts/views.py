from django.db import transaction
from rest_framework import generics
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from .serializers import CurrentUserSerializer, RegisterSerializer


class LoginView(TokenObtainPairView):
    # Anyone can access login, but valid credentials are required.
    permission_classes = [AllowAny]


class RegisterView(generics.CreateAPIView):
    # Public endpoint for registering a normal employee account.
    permission_classes = [AllowAny]
    serializer_class = RegisterSerializer

    @transaction.atomic
    def perform_create(self, serializer):
        serializer.save()


class CurrentUserView(APIView):
    # Only logged-in users can view their profile.
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = CurrentUserSerializer(request.user)
        return Response(serializer.data)