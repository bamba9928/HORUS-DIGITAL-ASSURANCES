from django.urls import path

from accounts.views import (
    AcceptInvitationView,
    AuthLoginView,
    AuthLogoutView,
    AuthMeView,
    AuthTokenObtainView,
    AuthTokenRefreshView,
    AuthTokenRevokeView,
    ChangePasswordView,
    ProfileView,
    UserDetailView,
    UserListCreateView,
)

urlpatterns = [
    path(
        "auth/invitations/accept/",
        AcceptInvitationView.as_view(),
        name="accept-invitation",
    ),
    path("auth/me/", AuthMeView.as_view(), name="auth-me"),
    path("auth/login/", AuthLoginView.as_view(), name="auth-login"),
    path("auth/logout/", AuthLogoutView.as_view(), name="auth-logout"),
    # Parcours jeton (clients sans cookie) : obtenir / renouveler / revoquer.
    # La connexion par session ci-dessus reste le parcours du front web.
    path("auth/token/", AuthTokenObtainView.as_view(), name="auth-token"),
    path("auth/token/refresh/", AuthTokenRefreshView.as_view(), name="auth-token-refresh"),
    path("auth/token/revoke/", AuthTokenRevokeView.as_view(), name="auth-token-revoke"),
    path("profile/", ProfileView.as_view(), name="profile"),
    path("profile/change-password/", ChangePasswordView.as_view(), name="change-password"),
    path("users/", UserListCreateView.as_view(), name="user-list-create"),
    path("users/<int:pk>/", UserDetailView.as_view(), name="user-detail"),
]
