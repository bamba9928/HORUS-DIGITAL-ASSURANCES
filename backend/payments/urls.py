from django.urls import path

from payments.views import OmCallbackView, OmInitiateView, OmStatusView, PaymentListView

urlpatterns = [
    path("", PaymentListView.as_view(), name="payment-list"),
    path("om/initiate/", OmInitiateView.as_view(), name="om-initiate"),
    path("om/<int:pk>/status/", OmStatusView.as_view(), name="om-status"),
    path("om/callback/", OmCallbackView.as_view(), name="om-callback"),
]
