from django.contrib.auth import authenticate, login, logout
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from accounts.models import User
from accounts.permissions import (
    can_manage_commission,
    can_manage_personal_info,
    can_manage_user,
    can_view_user,
)
from accounts.serializers import (
    AcceptInvitationSerializer,
    AuthLoginSerializer,
    ChangePasswordSerializer,
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
    # Limite les tentatives par IP (anti force brute) — taux defini dans
    # REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']['auth_login'].
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_login"

    def post(self, request):
        serializer = AuthLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        identifier = serializer.validated_data["identifier"]
        password = serializer.validated_data["password"]
        candidates = User.objects.filter(
            Q(username__iexact=identifier)
            | Q(email__iexact=identifier)
            | Q(phone=identifier)
        )[:2]
        candidate_list = list(candidates)
        authentication_username = (
            candidate_list[0].username
            if len(candidate_list) == 1
            else identifier
        )
        user = authenticate(
            request,
            username=authentication_username,
            password=password,
        )
        if len(candidate_list) != 1:
            user = None
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


class AcceptInvitationView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = AcceptInvitationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        user.set_password(serializer.validated_data["password"])
        user.save(update_fields=["password"])
        return Response({"detail": "Invitation acceptée. Vous pouvez vous connecter."})


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
        # Lecture : périmètre de visibilité (soi-même, son organisation pour un
        # admin groupe). La modification reste contrôlée par can_manage_user.
        target = get_object_or_404(User.objects.select_related("organization"), pk=self.kwargs["pk"])
        if can_view_user(self.request.user, target):
            return target
        self.permission_denied(self.request, message="Permission refusee.")

    def get_serializer_class(self):
        if self.request.method in {"PUT", "PATCH"}:
            return UserUpdateSerializer
        return UserReadSerializer

    def update(self, request, *args, **kwargs):
        target = self.get_object()
        access_fields = {"role", "organization", "is_active"}
        changes_access = bool(access_fields.intersection(request.data.keys()))
        allowed = (
            can_manage_user(request.user, target)
            if changes_access
            else can_manage_personal_info(request.user, target)
        )
        if not allowed:
            return Response({"detail": "Permission refusee."}, status=status.HTTP_403_FORBIDDEN)
        partial = kwargs.pop("partial", False)
        serializer = self.get_serializer(target, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(UserReadSerializer(user).data)


class ProfileView(APIView):
    """Profil du compte connecté — informations personnelles en lecture seule."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserReadSerializer(request.user).data)

    def patch(self, request):
        return Response(
            {
                "detail": (
                    "Les informations personnelles sont modifiables uniquement "
                    "par un administrateur autorise."
                )
            },
            status=status.HTTP_403_FORBIDDEN,
        )


class ChangePasswordView(APIView):
    """Changement de mot de passe du compte connecté."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from django.contrib.auth import update_session_auth_hash

        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save(update_fields=["password"])
        # Maintenir la session active après changement de mot de passe
        update_session_auth_hash(request, request.user)
        return Response({"detail": "Mot de passe mis à jour avec succès."})


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
