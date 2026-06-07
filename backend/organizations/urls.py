from django.urls import path

from organizations.views import OrganizationListView


urlpatterns = [
    path("", OrganizationListView.as_view(), name="organization-list"),
]
