from django.urls import path

from system.views import PlatformConfigView

urlpatterns = [
    path("", PlatformConfigView.as_view(), name="platform-config"),
]
