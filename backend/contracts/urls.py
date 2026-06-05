from django.urls import path

from contracts.views import (
    ContractConfirmPaymentView,
    ContractDetailView,
    ContractDraftDetailView,
    ContractDraftListCreateView,
    ContractDraftQuoteView,
    ContractIssueView,
    ContractListView,
    ContractSummaryView,
)

urlpatterns = [
    path("", ContractListView.as_view(), name="contract-list"),
    path("summary/", ContractSummaryView.as_view(), name="contract-summary"),
    path("drafts/", ContractDraftListCreateView.as_view(), name="contract-draft-list"),
    path("drafts/<int:pk>/", ContractDraftDetailView.as_view(), name="contract-draft-detail"),
    path("drafts/<int:pk>/quote/", ContractDraftQuoteView.as_view(), name="contract-draft-quote"),
    path("<int:pk>/", ContractDetailView.as_view(), name="contract-detail"),
    path("<int:pk>/quote/", ContractDraftQuoteView.as_view(), name="contract-quote"),
    path("<int:pk>/payments/confirm/", ContractConfirmPaymentView.as_view(), name="contract-payment-confirm"),
    path("<int:pk>/issue/", ContractIssueView.as_view(), name="contract-issue"),
]
