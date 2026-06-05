from django.urls import path

from integrations.ass.views import AssStockQrView, AssVerifyRegistrationView

urlpatterns = [
    path("stock-qr/", AssStockQrView.as_view(), name="ass-stock-qr"),
    path(
        "verify-registration/",
        AssVerifyRegistrationView.as_view(),
        name="ass-verify-registration",
    ),
]
