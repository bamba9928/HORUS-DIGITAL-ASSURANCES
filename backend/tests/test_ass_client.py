import pytest
from django.test import override_settings

from integrations.ass.client import AssClient
from integrations.ass.exceptions import AssConfigurationError, AssRealCallsDisabledError


class FakeAssResponse:
    def __init__(self, payload=None):
        self.payload = payload or {"operationStatus": "SUCCESS", "data": 123}

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload


class FakeAssSession:
    def __init__(self):
        self.calls = []

    def post(self, url, *, json, auth, timeout):
        self.calls.append(
            {
                "url": url,
                "json": json,
                "auth": auth,
                "timeout": timeout,
            }
        )
        return FakeAssResponse()


@override_settings(
    ASS_BASE_URL="https://kiiraytest.lasecu-assurances.sn",
    ASS_API_PARTNER_SEGMENT="partner",
    ASS_USERNAME="ass",
    ASS_PASSWORD="secret-test",
    ASS_MOCK_ENABLED=False,
    ASS_REAL_CALLS_ALLOWED=True,
)
def test_stock_qr_uses_confirmed_sandbox_partner_segment_and_post():
    session = FakeAssSession()
    client = AssClient(session=session)

    response = client.stock_qr({"code": "1000"})

    assert response["operationStatus"] == "SUCCESS"
    assert session.calls == [
        {
            "url": "https://kiiraytest.lasecu-assurances.sn/api/v1/partner/stock.qr",
            "json": {"code": "1000"},
            "auth": ("ass", "secret-test"),
            "timeout": 30,
        }
    ]


@override_settings(
    ASS_BASE_URL="https://kiiraytest.lasecu-assurances.sn",
    ASS_API_PARTNER_SEGMENT="partner",
    ASS_USERNAME="ass",
    ASS_PASSWORD="secret-test",
    ASS_MOCK_ENABLED=False,
    ASS_REAL_CALLS_ALLOWED=True,
)
def test_moto_rc_uses_post_endpoint_confirmed_by_ass():
    session = FakeAssSession()
    client = AssClient(session=session)

    client.calculate_moto_rc({"cylindre": 125})

    assert session.calls[0]["url"].endswith("/api/v1/partner/rc.moto")
    assert session.calls[0]["json"] == {"cylindre": 125}


@override_settings(
    ASS_BASE_URL="https://kiiraytest.lasecu-assurances.sn",
    ASS_API_PARTNER_SEGMENT="partner",
    ASS_USERNAME="ass",
    ASS_PASSWORD="secret-test",
    ASS_MOCK_ENABLED=False,
    ASS_REAL_CALLS_ALLOWED=True,
)
def test_fleet_rc_request_uses_post_endpoint_confirmed_by_ass():
    session = FakeAssSession()
    client = AssClient(session=session)

    client.calculate_fleet_rc({"requests": [{"requestId": "veh-1"}]})

    assert session.calls[0]["url"].endswith("/api/v1/partner/rc.flotte.request")
    assert session.calls[0]["json"] == {"requests": [{"requestId": "veh-1"}]}


@override_settings(
    ASS_BASE_URL="https://kiiraytest.lasecu-assurances.sn",
    ASS_API_PARTNER_SEGMENT="partner",
    ASS_USERNAME="ass",
    ASS_PASSWORD="secret-test",
    ASS_MOCK_ENABLED=False,
    ASS_REAL_CALLS_ALLOWED=False,
)
def test_real_ass_calls_remain_disabled_by_default_guard():
    client = AssClient(session=FakeAssSession())

    with pytest.raises(AssRealCallsDisabledError, match="desactives"):
        client.stock_qr()


@override_settings(
    ASS_BASE_URL="https://kiiraytest.lasecu-assurances.sn",
    ASS_API_PARTNER_SEGMENT="partner",
    ASS_USERNAME="",
    ASS_PASSWORD="",
    ASS_MOCK_ENABLED=False,
    ASS_REAL_CALLS_ALLOWED=True,
)
def test_real_ass_calls_require_basic_auth_credentials():
    client = AssClient(session=FakeAssSession())

    with pytest.raises(AssConfigurationError, match="ASS_USERNAME et ASS_PASSWORD"):
        client.stock_qr()
