from django.urls import path

from commissions.views import CommissionSnapshotListView, CommissionSnapshotStatusView

urlpatterns = [
    path("snapshots/", CommissionSnapshotListView.as_view(), name="commission-snapshot-list"),
    path(
        "snapshots/<int:pk>/status/",
        CommissionSnapshotStatusView.as_view(),
        name="commission-snapshot-status",
    ),
]
