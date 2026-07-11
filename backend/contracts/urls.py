from django.urls import path

from contracts.views import (
    ClientListView,
    ContractCancelView,
    ContractConfirmPaymentView,
    ContractDetailView,
    ContractDraftDetailView,
    ContractDraftListCreateView,
    ContractDraftQuoteView,
    ContractExportCsvView,
    ContractExportPdfView,
    ContractIssueView,
    ContractListView,
    ContractSummaryView,
    FinancialSummaryView,
)

urlpatterns = [
    path("", ContractListView.as_view(), name="contract-list"),
    path("clients/", ClientListView.as_view(), name="client-list"),
    path("summary/", ContractSummaryView.as_view(), name="contract-summary"),
    path("financial-summary/", FinancialSummaryView.as_view(), name="contract-financial-summary"),
    path("export/", ContractExportCsvView.as_view(), name="contract-export-csv"),
    path("drafts/", ContractDraftListCreateView.as_view(), name="contract-draft-list"),
    path("drafts/<int:pk>/", ContractDraftDetailView.as_view(), name="contract-draft-detail"),
    path("drafts/<int:pk>/quote/", ContractDraftQuoteView.as_view(), name="contract-draft-quote"),
    path("<int:pk>/", ContractDetailView.as_view(), name="contract-detail"),
    path("<int:pk>/export-pdf/", ContractExportPdfView.as_view(), name="contract-export-pdf"),
    path("<int:pk>/quote/", ContractDraftQuoteView.as_view(), name="contract-quote"),
    path("<int:pk>/payments/confirm/", ContractConfirmPaymentView.as_view(), name="contract-payment-confirm"),
    path("<int:pk>/issue/", ContractIssueView.as_view(), name="contract-issue"),
    path("<int:pk>/cancel/", ContractCancelView.as_view(), name="contract-cancel"),
]
