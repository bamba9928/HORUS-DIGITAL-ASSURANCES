from django.contrib.auth import login, logout
from django.contrib.auth.models import update_last_login
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenBlacklistView, TokenRefreshView

from accounts.models import User
from accounts.permissions import (
    can_manage_personal_info,
    can_manage_user,
    can_view_user,
)
from accounts.serializers import (
    AcceptInvitationSerializer,
    AuthLoginSerializer,
    ChangePasswordSerializer,
    UserCreateSerializer,
    UserReadSerializer,
    UserUpdateSerializer,
)
from accounts.services import authenticate_by_identifier


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
        user = authenticate_by_identifier(
            request,
            serializer.validated_data["identifier"],
            serializer.validated_data["password"],
        )
        if user is None:
            return Response({"detail": "Identifiants invalides."}, status=status.HTTP_400_BAD_REQUEST)
        login(request, user)
        return Response(
            {
                "authenticated": True,
                "user": UserReadSerializer(user).data,
            }
        )


class AuthTokenObtainView(APIView):
    """Delivre un couple access/refresh aux clients sans cookie (mobile).

    Pas de `csrf_protect` ici, contrairement a AuthLoginView : cette vue ne pose
    aucun cookie de session et ne s'appuie sur aucune authentification ambiante.
    Le CSRF protege le rejeu d'un cookie que le navigateur envoie tout seul ;
    il n'y a rien a rejouer quand le jeton doit etre lu dans le corps de la
    reponse puis pose a la main dans un en-tete.

    Aucune session n'est ouverte : `login()` n'est volontairement pas appele.
    """

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    # MEME compteur que la connexion par session (scope `auth_login`) : un scope
    # distinct ferait de ce point d'entree un contournement pur et simple de la
    # limitation anti-force-brute — l'attaquant se contenterait de taper ici.
    throttle_scope = "auth_login"

    def post(self, request):
        serializer = AuthLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = authenticate_by_identifier(
            request,
            serializer.validated_data["identifier"],
            serializer.validated_data["password"],
        )
        if user is None:
            return Response({"detail": "Identifiants invalides."}, status=status.HTTP_400_BAD_REQUEST)
        # `login()` s'en chargerait pour la session ; ici il faut le faire a la
        # main, sinon les comptes exclusivement mobiles paraitraient inactifs
        # depuis l'admin et les exports.
        update_last_login(None, user)
        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "user": UserReadSerializer(user).data,
            }
        )


class AuthTokenRefreshView(TokenRefreshView):
    """Echange un refresh valide contre un nouvel access (et un nouveau refresh).

    La rotation est activee (SIMPLE_JWT) : le refresh consomme part en liste
    noire. Un refresh rejoue une seconde fois est donc refuse — c'est ce qui
    permet de detecter un jeton vole plutot que de le laisser vivre 30 jours.
    """

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_token_refresh"


class AuthTokenRevokeView(TokenBlacklistView):
    """Deconnexion des clients a jeton : met le refresh en liste noire.

    L'access deja delivre reste valide jusqu'a son expiration (nature d'un JWT) —
    c'est pourquoi sa duree de vie est courte. Le refresh, lui, est mort des cet
    appel : le client ne peut plus se reprolonger.
    """

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_token_refresh"


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


