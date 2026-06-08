from django.urls import path

from accounts.views import (
    AuthLoginView,
    AuthLogoutView,
    AuthMeView,
    ChangePasswordView,
    ProfileView,
    UserCommissionView,
    UserDetailView,
    UserListCreateView,
)

urlpatterns = [
    path("auth/me/", AuthMeView.as_view(), name="auth-me"),
    path("auth/login/", AuthLoginView.as_view(), name="auth-login"),
    path("auth/logout/", AuthLogoutView.as_view(), name="auth-logout"),
    path("profile/", ProfileView.as_view(), name="profile"),
    path("profile/change-password/", ChangePasswordView.as_view(), name="change-password"),
    path("users/", UserListCreateView.as_view(), name="user-list-create"),
    path("users/<int:pk>/", UserDetailView.as_view(), name="user-detail"),
    path("users/<int:pk>/commission/", UserCommissionView.as_view(), name="user-commission"),
]
