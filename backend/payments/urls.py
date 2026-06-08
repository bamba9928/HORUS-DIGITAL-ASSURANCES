from django.urls import path

from payments.views import PaymentListView

urlpatterns = [
    path("", PaymentListView.as_view(), name="payment-list"),
]
