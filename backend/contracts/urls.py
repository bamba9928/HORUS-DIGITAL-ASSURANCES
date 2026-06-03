from django.urls import path

from contracts.views import (
    ContractConfirmPaymentView,
    ContractDraftDetailView,
    ContractDraftListCreateView,
    ContractDraftQuoteView,
    ContractIssueView,
)

urlpatterns = [
    path("drafts/", ContractDraftListCreateView.as_view(), name="contract-draft-list"),
    path("drafts/<int:pk>/", ContractDraftDetailView.as_view(), name="contract-draft-detail"),
    path("drafts/<int:pk>/quote/", ContractDraftQuoteView.as_view(), name="contract-draft-quote"),
    path("<int:pk>/payments/confirm/", ContractConfirmPaymentView.as_view(), name="contract-payment-confirm"),
    path("<int:pk>/issue/", ContractIssueView.as_view(), name="contract-issue"),
]
