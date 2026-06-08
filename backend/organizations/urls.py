from django.urls import path

from organizations.views import OrganizationDetailView, OrganizationListCreateView


urlpatterns = [
    path("", OrganizationListCreateView.as_view(), name="organization-list-create"),
    path("<int:pk>/", OrganizationDetailView.as_view(), name="organization-detail"),
]
