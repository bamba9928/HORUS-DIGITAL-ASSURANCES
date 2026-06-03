from django.contrib.auth import authenticate, login, logout
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from accounts.permissions import can_manage_commission, can_manage_user
from accounts.serializers import (
    AuthLoginSerializer,
    UserCommissionSerializer,
    UserCreateSerializer,
    UserReadSerializer,
    UserUpdateSerializer,
)


@method_decorator(ensure_csrf_cookie, name="dispatch")
class AuthMeView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        if not request.user.is_authenticated:
            return Response({"authenticated": False, "user": None})
        return Response(
            {
                "authenticated": True,
                "user": UserReadSerializer(request.user).data,
            }
        )


@method_decorator(csrf_protect, name="dispatch")
class AuthLoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = AuthLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = authenticate(
            request,
            username=serializer.validated_data["username"],
            password=serializer.validated_data["password"],
        )
        if user is None or not user.is_active:
            return Response({"detail": "Identifiants invalides."}, status=status.HTTP_400_BAD_REQUEST)
        login(request, user)
        return Response(
            {
                "authenticated": True,
                "user": UserReadSerializer(user).data,
            }
        )


class AuthLogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        logout(request)
        return Response({"authenticated": False})


class UserListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        queryset = User.objects.select_related("organization").order_by("username")
        if user.is_admin_general:
            return queryset
        if user.is_admin_group and user.organization_id:
            return queryset.filter(organization_id=user.organization_id)
        return queryset.none()

    def get_serializer_class(self):
        if self.request.method == "POST":
            return UserCreateSerializer
        return UserReadSerializer

    def list(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return Response({"results": serializer.data})

    def create(self, request, *args, **kwargs):
        if not (request.user.is_admin_general or request.user.is_admin_group):
            return Response({"detail": "Permission refusee."}, status=status.HTTP_403_FORBIDDEN)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(UserReadSerializer(user).data, status=status.HTTP_201_CREATED)


class UserDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsAuthenticated]

    def get_object(self):
        target = get_object_or_404(User.objects.select_related("organization"), pk=self.kwargs["pk"])
        if self.request.user.id == target.id or can_manage_user(self.request.user, target):
            return target
        self.permission_denied(self.request, message="Permission refusee.")

    def get_serializer_class(self):
        if self.request.method in {"PUT", "PATCH"}:
            return UserUpdateSerializer
        return UserReadSerializer

    def update(self, request, *args, **kwargs):
        target = self.get_object()
        if not can_manage_user(request.user, target):
            return Response({"detail": "Permission refusee."}, status=status.HTTP_403_FORBIDDEN)
        partial = kwargs.pop("partial", False)
        serializer = self.get_serializer(target, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(UserReadSerializer(user).data)


class UserCommissionView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        target = get_object_or_404(User.objects.select_related("organization"), pk=pk)
        if request.user.id != target.id and not can_manage_commission(request.user, target):
            return Response({"detail": "Permission refusee."}, status=status.HTTP_403_FORBIDDEN)
        return Response(UserCommissionSerializer(target).data)

    def patch(self, request, pk):
        target = get_object_or_404(User.objects.select_related("organization"), pk=pk)
        if not can_manage_commission(request.user, target):
            return Response({"detail": "Permission refusee."}, status=status.HTTP_403_FORBIDDEN)
        serializer = UserCommissionSerializer(target, data=request.data, partial=True, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(UserCommissionSerializer(user).data)
