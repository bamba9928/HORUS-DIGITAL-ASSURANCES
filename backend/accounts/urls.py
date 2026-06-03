from django.urls import path

from accounts.views import (
    AuthLoginView,
    AuthLogoutView,
    AuthMeView,
    UserCommissionView,
    UserDetailView,
    UserListCreateView,
)

urlpatterns = [
    path("auth/me/", AuthMeView.as_view(), name="auth-me"),
    path("auth/login/", AuthLoginView.as_view(), name="auth-login"),
    path("auth/logout/", AuthLogoutView.as_view(), name="auth-logout"),
    path("users/", UserListCreateView.as_view(), name="user-list-create"),
    path("users/<int:pk>/", UserDetailView.as_view(), name="user-detail"),
    path("users/<int:pk>/commission/", UserCommissionView.as_view(), name="user-commission"),
]
